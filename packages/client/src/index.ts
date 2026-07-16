import { Application, type Renderer } from "pixi.js";
import {
    receiver,
    setupGUIPacketReceiving,
    setupPacketReceiving,
} from "./network/receiver";
import { ClientPacket } from "@bundu/shared/packet_definitions";
import { World } from "./world/world";
import { createViewport, destroyViewport } from "./rendering/viewport";
import { createUI } from "./ui/ui";
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
import { replaceVisualDefs } from "./visual/defs";

declare const __DEBUG__: boolean;

declare namespace globalThis {
    var __PIXI_APP__: Application;
}

const GAME_WS_URL =
    process.env.GAME_WS_URL ?? "ws://localhost:7777";

const PACK_SYNC_ATTEMPTS = 5;
const PACK_SYNC_RETRY_MS = 1000;

type ClientDebugHandle = {
    getPlaceStructureId(): number | null;
};

const app = new Application<Renderer<HTMLCanvasElement>>();
globalThis.__PIXI_APP__ = app;

function setMenuVisible(visible: boolean) {
    document.querySelectorAll(".menu").forEach((item) => {
        if (item.id === "pack-loading" || item.id === "pack-error") return;
        item.classList.toggle("hidden", !visible);
    });
}

function element<T extends HTMLElement>(id: string): T {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing #${id}`);
    return node as T;
}

const packLoading = element<HTMLElement>("pack-loading");
const packError = element<HTMLElement>("pack-error");
const packErrorMessage = element<HTMLElement>("pack-error-message");
const packRetryButton = element<HTMLButtonElement>("pack-retry-button");
const packBackButton = element<HTMLButtonElement>("pack-back-button");

function showPackLoading() {
    packError.classList.add("hidden");
    packLoading.classList.remove("hidden");
}

function hidePackOverlays() {
    packLoading.classList.add("hidden");
    packError.classList.add("hidden");
}

function showPackError(error: unknown) {
    packLoading.classList.add("hidden");
    packErrorMessage.textContent =
        error instanceof Error
            ? error.message
            : String(error || "Start the game server and try again.");
    packError.classList.remove("hidden");
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

let packFingerprint = "";
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

async function synchronizeResourcePacks() {
    if (
        packFingerprint &&
        (await getResourcePackFingerprint(GAME_WS_URL)) === packFingerprint
    ) {
        return;
    }
    const resourcePacks = await loadResourcePacks(GAME_WS_URL);
    await initAssets(resourcePacks.assets);
    replaceVisualDefs(
        resourcePacks.visualDefs,
        resourcePacks.assets.map((asset) => asset.path)
    );
    packFingerprint = resourcePacks.fingerprint;
}

async function synchronizeResourcePacksWithRetry(
    attempts = PACK_SYNC_ATTEMPTS
): Promise<void> {
    showPackLoading();
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            await synchronizeResourcePacks();
            hidePackOverlays();
            return;
        } catch (error) {
            lastError = error;
            console.warn(
                `Resource pack sync failed (attempt ${attempt}/${attempts})`,
                error
            );
            if (attempt < attempts) await sleep(PACK_SYNC_RETRY_MS);
        }
    }
    showPackError(lastError);
    throw lastError instanceof Error
        ? lastError
        : new Error("Resource pack sync failed");
}

/** Quiet when already synced; otherwise show pack loading UI. */
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
            hidePackOverlays();
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
            packRetryButton.removeEventListener("click", tryLoad);
            packBackButton.removeEventListener("click", onBack);
            playButton.removeEventListener("click", onPlay, true);
            nameInput.removeEventListener("keydown", onNameKey);
        };
        packRetryButton.addEventListener("click", tryLoad);
        packBackButton.addEventListener("click", onBack);
        playButton.addEventListener("click", onPlay, true);
        nameInput.addEventListener("keydown", onNameKey);
    });
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
    });
    document.oncontextmenu = () => false;

    const viewport = createViewport(app);
    app.stage.addChild(viewport);

    // Debug tools / overlay — omitted entirely from prod bundles.
    let debug: ClientDebugHandle = {
        getPlaceStructureId: () => null,
    };
    if (__DEBUG__) {
        const { mountClientDebug } = await import("./debug/tools");
        debug = mountClientDebug(viewport);
        const { initDevtools } = await import("@pixi/devtools");
        await initDevtools({ app });
    }

    const world = new World(viewport);
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
            if (connecting && !document.querySelector(".menu:not(.hidden)")) {
                playButton.textContent = "Reconnecting…";
            } else if (!connecting) {
                playButton.textContent = "Play";
            }
        },
        onConnected: () => {
            playButton.textContent = "Play";
            setMenuVisible(false);
        },
        onSoftDisconnected: () => {
            // Keep game shell visible; reconnect with the same reclaim token.
            setMenuVisible(false);
            playButton.textContent = "Reconnecting…";
        },
        onHardDisconnected: () => {
            dropSessionId();
            playButton.textContent = "Play";
            setMenuVisible(true);
            nameInput.focus();
        },
    });

    packRetryButton.addEventListener("click", () => {
        void session.connect();
    });
    packBackButton.addEventListener("click", () => {
        hidePackOverlays();
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
        getPlaceStructureId: () => debug.getPlaceStructureId(),
        isOverInventory: () => gui.inventory.isInteracting,
        isPlacementAllowed: () => world.isPlacementAllowed(),
    });
    input.onToggleLeaderboard = () => gui.leaderboard.toggle();
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
    gui.craftingMenu.leftclick = (itemId) => {
        const local = world.objects.get(world.user ?? -1);
        if (local instanceof Player && local.isCrafting) return;
        session.sendPacket(ClientPacket.CraftItem, { itemId });
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
        const local = world.objects.get(world.user ?? -1);
        gui.craftingMenu.craftingItemId =
            local instanceof Player ? local.craftingItemId : null;
    };
    app.ticker.add(tick);

    const destroy = () => {
        session.destroy();
        app.ticker.remove(tick);
        playButton.removeEventListener("click", handlePlay);
        nameInput.removeEventListener("keydown", handleNameKey);
        input.destroy();
        world.destroy();
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
    showPackError(error);
});
