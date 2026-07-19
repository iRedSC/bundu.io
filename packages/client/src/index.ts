import { Application, type Renderer } from "pixi.js";
import "pixi.js/advanced-blend-modes";
import {
    receiver,
    setupGUIPacketReceiving,
    setupPacketReceiving,
} from "./network/receiver";
import { ClientPacket, ServerPacket } from "@bundu/shared/packet_definitions";
import { World } from "./world/world";
import { createViewport, destroyViewport } from "./rendering/viewport";
import { createUI } from "./ui/ui";
import { createAdminEditor } from "./admin/editor";
import { initAssets } from "./assets/load";
import {
    getResourcePackFingerprint,
    loadResourcePacks,
} from "./assets/resource_packs";
import { AnimationManagers } from "./animation/animations";
import { InputController } from "./input/controller";
import { Player } from "./world/objects/player";
import { GameSession } from "./session/game_session";
import { clientTime } from "./globals";
import { replaceCompiledModelDefs } from "./models/defs";
import { replaceClientRegistries } from "./configs/registries";
import {
    hideLoading,
    isLoadingOverlay,
    loadingBackButton,
    loadingRetryButton,
    setLoadingProgress,
    showLoading,
    showLoadingError,
} from "./ui/loading_screen";

declare const __DEBUG__: boolean;

declare namespace globalThis {
    var __PIXI_APP__: Application;
}

const GAME_WS_URL =
    process.env.GAME_WS_URL ?? "ws://localhost:7777";

const PACK_SYNC_ATTEMPTS = 5;
const PACK_SYNC_RETRY_MS = 1000;

const app = new Application<Renderer<HTMLCanvasElement>>();
globalThis.__PIXI_APP__ = app;

function setMenuVisible(visible: boolean) {
    document.querySelectorAll(".menu").forEach((item) => {
        if (isLoadingOverlay(item)) return;
        item.classList.toggle("hidden", !visible);
    });
}

function element<T extends HTMLElement>(id: string): T {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing #${id}`);
    return node as T;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

let packFingerprint = "";
/** Cancels an in-flight waitForWorldReady when the session hard-fails / backs out. */
let worldGateGeneration = 0;
const SESSION_KEY = "bundu.session_id";

function readSessionId(): string {
    return sessionStorage.getItem(SESSION_KEY) ?? crypto.randomUUID();
}

function ensureSessionId(): string {
    const sessionId = readSessionId();
    sessionStorage.setItem(SESSION_KEY, sessionId);
    return sessionId;
}

function dropSessionId(): void {
    sessionStorage.removeItem(SESSION_KEY);
}

ensureSessionId();

async function synchronizeResourcePacks(): Promise<void> {
    setLoadingProgress({
        title: "Loading…",
        status: "Checking resource packs…",
        progress: 0.05,
    });
    if (
        packFingerprint &&
        (await getResourcePackFingerprint(GAME_WS_URL)) === packFingerprint
    ) {
        setLoadingProgress({
            status: "Resource packs ready",
            progress: 0.5,
        });
        return;
    }
    setLoadingProgress({
        status: "Downloading resource packs…",
        progress: 0.15,
    });
    const resourcePacks = await loadResourcePacks(GAME_WS_URL);
    setLoadingProgress({
        status: "Applying registries…",
        progress: 0.45,
    });
    replaceClientRegistries(resourcePacks.registries);
    setLoadingProgress({
        status: "Loading textures…",
        progress: 0.55,
    });
    await initAssets(resourcePacks.assets);
    setLoadingProgress({
        status: "Compiling models…",
        progress: 0.85,
    });
    replaceCompiledModelDefs(
        resourcePacks.modelDefs,
        resourcePacks.assets.map((asset) => asset.path)
    );
    packFingerprint = resourcePacks.fingerprint;
    setLoadingProgress({
        status: "Resource packs ready",
        progress: 0.9,
    });
}

async function synchronizeResourcePacksWithRetry(
    attempts = PACK_SYNC_ATTEMPTS
): Promise<void> {
    showLoading({
        title: "Loading…",
        status: "Starting…",
        progress: 0,
    });
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            await synchronizeResourcePacks();
            return;
        } catch (error) {
            lastError = error;
            console.warn(
                `Resource pack sync failed (attempt ${attempt}/${attempts})`,
                error
            );
            if (attempt < attempts) {
                setLoadingProgress({
                    status: `Retrying resource packs (${attempt}/${attempts})…`,
                });
                await sleep(PACK_SYNC_RETRY_MS);
            }
        }
    }
    showLoadingError(lastError, "Could not load resource packs");
    throw lastError instanceof Error
        ? lastError
        : new Error("Resource pack sync failed");
}

/** Quiet when already synced; otherwise show loading UI. */
async function prepareConnectionPacks(): Promise<void> {
    if (packFingerprint) {
        try {
            if (
                (await getResourcePackFingerprint(GAME_WS_URL)) ===
                packFingerprint
            ) {
                return;
            }
        } catch {
            // Fall through to visible sync.
        }
    }
    await synchronizeResourcePacksWithRetry();
}

function buildSocketUrl(username: string) {
    const url = new URL(GAME_WS_URL);
    url.searchParams.set("username", username || "unnamed");
    url.searchParams.set("skin_id", "0");
    url.searchParams.set("session_id", ensureSessionId());
    url.searchParams.set("packs", packFingerprint);
    return url.toString();
}

/** Load packs only after the user clicks Play (servers may differ). */
async function waitForPlayPackSync(
    playButton: HTMLButtonElement,
    nameInput: HTMLInputElement
): Promise<void> {
    await new Promise<void>((resolve) => {
        const tryLoad = () => {
            void synchronizeResourcePacksWithRetry()
                .then(() => {
                    cleanup();
                    resolve();
                })
                .catch(() => {
                    // Error overlay already shown; allow another retry.
                });
        };
        const onBack = () => {
            hideLoading();
            setMenuVisible(true);
        };
        const onPlay = (event: Event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            tryLoad();
        };
        const onNameKey = (event: KeyboardEvent) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            tryLoad();
        };
        const cleanup = () => {
            loadingRetryButton.removeEventListener("click", tryLoad);
            loadingBackButton.removeEventListener("click", onBack);
            playButton.removeEventListener("click", onPlay, true);
            nameInput.removeEventListener("keydown", onNameKey);
        };
        loadingRetryButton.addEventListener("click", tryLoad);
        loadingBackButton.addEventListener("click", onBack);
        playButton.addEventListener("click", onPlay, true);
        nameInput.addEventListener("keydown", onNameKey);
    });
}

async function waitForWorldReady(
    world: World
): Promise<{ ready: boolean; gen: number }> {
    const gen = ++worldGateGeneration;
    showLoading({
        title: "Loading…",
        status: "Connecting to world…",
        progress: 0.55,
    });

    const started = performance.now();
    // Wait until the server has synced ground (including ocean-only maps).
    while (gen === worldGateGeneration) {
        if (world.hasGroundSync()) break;
        if (performance.now() - started > 15_000) {
            hideLoading();
            setMenuVisible(true);
            return { ready: false, gen };
        }
        setLoadingProgress({
            status: "Loading world…",
            progress: 0.6,
        });
        await sleep(40);
    }
    if (gen !== worldGateGeneration) return { ready: false, gen };

    while (gen === worldGateGeneration) {
        if (world.landSeamProgress().pending === 0) break;
        world.flushLandSeams(8);
        // Progress after flush — pre-flush `done` left the bar lagging the bake.
        const { done, total } = world.landSeamProgress();
        const frac = total > 0 ? done / total : 1;
        setLoadingProgress({
            status: `Preparing terrain… (${done}/${total})`,
            progress: 0.65 + 0.34 * frac,
        });
        await sleep(0);
    }
    if (gen !== worldGateGeneration) return { ready: false, gen };

    setLoadingProgress({ status: "Ready", progress: 1 });
    // Bar uses a 150ms width transition — wait so 100% paints before teardown.
    await sleep(180);
    if (gen !== worldGateGeneration) return { ready: false, gen };

    hideLoading();
    return { ready: true, gen };
}

async function main() {
    const nameInput = element<HTMLInputElement>("name-input");
    const playButton = element<HTMLButtonElement>("play-button");
    nameInput.focus();

    // Packs belong to the chosen server — fetch only when joining.
    await waitForPlayPackSync(playButton, nameInput);

    await app.init({
        resizeTo: window,
        backgroundColor: 0x0d5b73,
        antialias: false,
        autoDensity: true,
        // Required for advanced blend modes (e.g. fire sky_undo `divide`).
        useBackBuffer: true,
    });
    document.oncontextmenu = () => false;

    const viewport = createViewport(app);
    app.stage.addChild(viewport);

    // Debug tools / overlay — omitted entirely from prod bundles.
    if (__DEBUG__) {
        const { mountClientDebug } = await import("./debug/tools");
        mountClientDebug(viewport);
        const { initDevtools } = await import("@pixi/devtools");
        await initDevtools({ app });
    }

    const world = new World(viewport, app.renderer);
    setupPacketReceiving(receiver, world);

    if (__DEBUG__) {
        const { startConfigHotReload } = await import(
            "./debug/config_hot_reload"
        );
        startConfigHotReload(world);
    }

    // * GUI
    const gui = createUI();
    app.stage.addChild(gui.container);
    setupGUIPacketReceiving(receiver, gui);

    const session = new GameSession(receiver, {
        prepareConnection: prepareConnectionPacks,
        autoReconnect: true,
        buildSocketUrl,
        getUsername: () => nameInput.value.trim(),
        resetLocalState: () => {
            clientTime.resetServerSync();
            setFreecamUi(false);
            world.clear();
            gui.health.update(0);
            gui.hunger.update(0);
            gui.heat.update(0);
            gui.inventory.update({ items: [], cursor: null });
            gui.recipeManager.recipes.clear();
            gui.craftingMenu.items = [];
            gui.craftingMenu.update();
            gui.leaderboard.clear();
            input.closeChat();
        },
        setConnecting: (connecting) => {
            playButton.disabled = connecting;
            if (connecting) {
                showLoading({
                    title: "Loading…",
                    status: "Connecting…",
                    progress: 0.5,
                });
            }
            if (connecting && !document.querySelector(".menu:not(.hidden)")) {
                playButton.textContent = "Reconnecting…";
            } else if (!connecting) {
                playButton.textContent = "Play";
            }
        },
        onConnected: () => {
            playButton.textContent = "Play";
            setMenuVisible(false);
            void waitForWorldReady(world).then(({ ready, gen }) => {
                // Soft disconnect / back-to-menu bumps the gate; don't send stale ready.
                if (!ready || gen !== worldGateGeneration) return;
                session.sendPacket(ClientPacket.ClientReady, {});
            });
        },
        onSoftDisconnected: () => {
            // Cancel any in-flight ClientReady gate; reconnect restarts it.
            worldGateGeneration++;
            hideLoading();
            // Keep game shell visible; reconnect with the same reclaim token.
            setMenuVisible(false);
            playButton.textContent = "Reconnecting…";
        },
        onHardDisconnected: () => {
            worldGateGeneration++;
            hideLoading();
            dropSessionId();
            playButton.textContent = "Play";
            setMenuVisible(true);
            nameInput.focus();
        },
    });

    const editor = createAdminEditor(
        session.sendPacket,
        (screenX, screenY) => viewport.toLocal({ x: screenX, y: screenY }),
        world,
        viewport
    );
    app.stage.addChild(editor.container);

    const setFreecamUi = (enabled: boolean) => {
        world.setFreecamMode(enabled);
        gui.container.visible = !enabled;
        editor.setActive(enabled);
    };

    receiver.on(ServerPacket.FreecamMode, ({ enabled }) => {
        setFreecamUi(enabled);
    });

    world.onViewBounds = (bounds) => {
        session.sendPacket(ClientPacket.ViewBounds, bounds);
    };
    loadingRetryButton.addEventListener("click", () => {
        void session.connect();
    });
    loadingBackButton.addEventListener("click", () => {
        worldGateGeneration++;
        hideLoading();
        setMenuVisible(true);
    });

    // * Keyboard / mouse inputs
    // `input` is referenced from session.resetLocalState; const TDZ is fine because
    // reset only runs after connect(), which is after this declaration.
    const input = new InputController(session.sendPacket, {
        getLocalPlayer: () => {
            const object = world.objects.get(world.user ?? -1);
            return object instanceof Player ? object : undefined;
        },
        markUpdating: (player) => {
            world.objects.updating.add(player);
        },
        screenToWorld: (screenX, screenY) =>
            viewport.toLocal({ x: screenX, y: screenY }),
        setCursorWorld: (position) => world.setCursorWorld(position),
        isInGame: () => session.isInGame(),
        isOverInventory: () => gui.inventory.isInteracting,
        isPlacementAllowed: () => world.isPlacementAllowed(),
        isFreecam: () => world.camera.isFreecam(),
    });
    input.onToggleLeaderboard = () => gui.leaderboard.toggle();
    input.onShowWorldHover = (show) => world.setShowAllHover(show);
    world.onPlacementValidity = (allowed) => input.onPlacementValidity(allowed);

    gui.inventory.isLocked = () => {
        const local = world.objects.get(world.user ?? -1);
        return local instanceof Player && local.isCrafting;
    };
    gui.inventory.onSelect = (slot) => {
        session.sendPacket(ClientPacket.SelectItem, { slot });
    };
    gui.inventory.onMove = (from, to) => {
        session.sendPacket(ClientPacket.MoveSlot, { from, to });
    };
    gui.inventory.onCursor = (slot, mode) => {
        session.sendPacket(ClientPacket.CursorSlot, { slot, mode });
    };
    gui.inventory.getDropTargetGlobal = () => {
        const object = world.objects.get(world.user ?? -1);
        if (!(object instanceof Player)) return null;
        return viewport.toGlobal({
            x: object.position.x + Math.cos(object.rotation) * 80,
            y: object.position.y + Math.sin(object.rotation) * 80,
        });
    };
    gui.craftingMenu.leftclick = (recipeId) => {
        const local = world.objects.get(world.user ?? -1);
        if (local instanceof Player && local.isCrafting) return;
        session.sendPacket(ClientPacket.CraftItem, { recipeId });
    };

    app.canvas.oncontextmenu = () => {};
    document.body.appendChild(app.canvas);

    viewport.sortChildren();

    const handlePlay = (event: MouseEvent) => {
        event.preventDefault();
        session.connect();
    };
    const handleNameKey = (event: KeyboardEvent) => {
        if (event.key === "Enter") {
            event.preventDefault();
            session.connect();
        }
    };
    playButton.addEventListener("click", handlePlay);
    nameInput.addEventListener("keydown", handleNameKey);

    // User already pressed Play to load packs — join immediately.
    session.connect();

    const tick = (ticker: { deltaMS: number }) => {
        const now = clientTime.now();
        input.update();
        world.tick(Math.min(ticker.deltaMS, 50), now);
        AnimationManagers.UI.update(now);
        gui.tick(now);
        editor.tick(now);
        const local = world.objects.get(world.user ?? -1);
        gui.craftingMenu.craftingRecipeId =
            local instanceof Player ? local.craftingRecipeId : null;
    };
    app.ticker.add(tick);

    const destroy = () => {
        session.destroy();
        app.ticker.remove(tick);
        playButton.removeEventListener("click", handlePlay);
        nameInput.removeEventListener("keydown", handleNameKey);
        input.destroy();
        world.destroy();
        editor.destroy();
        gui.destroy();
        destroyViewport(viewport);
        document.oncontextmenu = null;
        app.canvas.remove();
        app.destroy();
    };
    window.addEventListener("pagehide", destroy, { once: true });
}

main().catch((error: unknown) => {
    console.error("Client startup failed", error);
    showLoadingError(error);
});
