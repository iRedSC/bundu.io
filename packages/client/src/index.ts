import { Application, Point, type Renderer } from "pixi.js";
import "pixi.js/advanced-blend-modes";
import {
    receiver,
    setupChatPacketReceiving,
    setupGUIPacketReceiving,
    setupPacketReceiving,
} from "./network/receiver";
import { ClientPacket, ServerPacket } from "@bundu/shared/packet_definitions";
import { WORLD_BOUNDS } from "@bundu/shared/tiles";
import { percentOf } from "@bundu/shared/math";
import { generateUsername } from "@bundu/shared/username";
import { World } from "./world/world";
import { createViewport, destroyViewport } from "./rendering/viewport";
import { createUI } from "./ui/ui";
import { ChatController } from "./ui/chat";
import { createTooltip, hideTooltip } from "./ui/tooltip";
import {
    createFreecamControl,
    MODE_CONTROL_GAP,
    MODE_CONTROL_SIZE,
} from "./ui/freecam_control";
import { createAdminEditor } from "./admin/editor";
import { createCreativeControl, createCreativeEditor } from "./creative";
import { initAssets } from "./assets/load";
import {
    getResourcePackFingerprint,
    loadResourcePacks,
} from "./assets/resource_packs";
import { AnimationManagers } from "./animation/animations";
import { InputController } from "./input/controller";
import { Player } from "./world/objects/player";
import { GROUND_ITEM_SIZE } from "./world/objects/ground_item";
import { ITEM_BUTTON_SIZE } from "./constants";
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
import {
    gameOverMenuButton,
    gameOverRespawnButton,
    hideGameOver,
    showGameOver,
} from "./ui/game_over";
import {
    captureDeathLayers,
    type DeathCapture,
} from "./rendering/capture_frame";

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
    url.searchParams.set("username", username);
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
        if (world.flushLandSeams(8)) break;
        // Progress after flush — nearby keep-ring only (distant streams later).
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
    let bindDebugChat:
        | typeof import("./debug/tools").bindDebugChat
        | undefined;
    if (__DEBUG__) {
        const debugTools = await import("./debug/tools");
        debugTools.mountClientDebug(viewport);
        bindDebugChat = debugTools.bindDebugChat;
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
    const tooltip = createTooltip();
    app.stage.sortableChildren = true;
    // Above creative chrome so the cursor ghost paints over the palette.
    gui.container.zIndex = 110;
    app.stage.addChild(gui.container);
    app.stage.addChild(tooltip.container);
    setupGUIPacketReceiving(receiver, gui, world);
    const chat = new ChatController();
    chat.playerNames = () => {
        const names: string[] = [];
        for (const object of world.objects.all()) {
            if (!(object instanceof Player)) continue;
            const text = object.name.text.trim();
            if (text) names.push(text);
        }
        return names;
    };
    setupChatPacketReceiving(receiver, world, chat);

    let deathFrame: DeathCapture | null = null;
    /** Pixi HUD layers captured separately from the world for the death screen. */
    const deathUiLayers = [gui.container, tooltip.container];

    const session = new GameSession(receiver, {
        prepareConnection: prepareConnectionPacks,
        autoReconnect: true,
        buildSocketUrl,
        getUsername: () => {
            const trimmed = nameInput.value.trim();
            if (trimmed) return trimmed;
            const generated = generateUsername();
            nameInput.value = generated;
            return generated;
        },
        resetLocalState: () => {
            clientTime.resetServerSync();
            setFreecamUi(false);
            world.clear();
            gui.health.update(0);
            gui.hunger.update(0);
            gui.heat.update(0);
            gui.thirst.update(0);
            gui.inventory.update({ items: [], cursor: null });
            gui.recipeManager.recipes.clear();
            gui.craftingMenu.items = [];
            gui.craftingMenu.update();
            gui.leaderboard.clear();
            chat.setRegistry({ commands: [] });
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
            hideGameOver();
            deathFrame = null;
            setMenuVisible(false);
            chat.setVisible(true);
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
        onBeforeDeath: async () => {
            world.beginDeathCinematic();
            // Let in-flight client FX (e.g. sword swing) finish before snapshot.
            await sleep(75);
            deathFrame = captureDeathLayers(app, [viewport], deathUiLayers);
        },
        onHardDisconnected: ({ died }) => {
            worldGateGeneration++;
            hideLoading();
            dropSessionId();
            playButton.textContent = "Play";
            chat.setVisible(false);
            if (died) {
                setMenuVisible(false);
                showGameOver(deathFrame);
                deathFrame = null;
                return;
            }
            hideGameOver();
            deathFrame = null;
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
    deathUiLayers.push(editor.container);

    const creative = createCreativeEditor(session.sendPacket, {
        hasCursor: () => gui.inventory.cursor !== null,
        onPickedToCursor: (itemId, count) =>
            gui.inventory.adoptCursor([itemId, count], true),
    });
    app.stage.addChild(creative.container);
    deathUiLayers.push(creative.container);

    const clampWorld = (value: number) =>
        Math.min(Math.max(value, 0), WORLD_BOUNDS);

    const freecamControl = createFreecamControl({
        onEnter: () => {
            session.sendPacket(ClientPacket.ChatMessage, {
                message: "/freecam",
            });
        },
        onExit: () => {
            session.sendPacket(ClientPacket.ChatMessage, {
                message: "/freecam",
            });
        },
        onExitAt: (screenX, screenY) => {
            const worldPos = viewport.toLocal({ x: screenX, y: screenY });
            const x = clampWorld(worldPos.x);
            const y = clampWorld(worldPos.y);
            const local = world.objects.get(world.user ?? -1);
            if (local) {
                // Keep follow on the drop point when FreecamMode arrives first.
                local.positionStates.snap({ x, y });
                local.container.position.set(x, y);
            }
            session.sendPacket(ClientPacket.ExitFreecamAt, { x, y });
        },
        isBlockedDrop: (screenX, screenY) =>
            editor.containsPoint(screenX, screenY) ||
            creative.containsPoint(screenX, screenY),
    });

    const creativeControl = createCreativeControl({
        onToggle: () => {
            session.sendPacket(ClientPacket.ChatMessage, {
                message: "/creative",
            });
        },
    });

    editor.setExternalUiHit((screenX, screenY) =>
        freecamControl.containsPoint(screenX, screenY) ||
        freecamControl.isDragging() ||
        creativeControl.containsPoint(screenX, screenY)
    );
    app.stage.addChild(freecamControl.container);
    app.stage.addChild(creativeControl.container);

    /** Stack Cre / Cam as equal squares to the right of the hotbar. */
    const layoutModeControls = () => {
        const x =
            gui.inventory.hotbarRightEdge() +
            MODE_CONTROL_GAP +
            MODE_CONTROL_SIZE / 2;
        const baseY = gui.inventory.hotbarBaselineY();
        // Freecam on the hotbar baseline; Creative stacked above it.
        freecamControl.setAnchor(x, baseY);
        creativeControl.setAnchor(
            x,
            baseY - MODE_CONTROL_SIZE - MODE_CONTROL_GAP
        );
    };

    let freecamActive = false;
    let creativeWanted = false;

    const refreshModeAvailability = () => {
        freecamControl.setAvailable(chat.hasServerCommand("freecam"));
        freecamControl.setInGame(session.isInGame());
        creativeControl.setAvailable(chat.hasServerCommand("creative"));
        creativeControl.setInGame(session.isInGame());
        layoutModeControls();
    };
    chat.onRegistryChange = refreshModeAvailability;

    const syncCreativeChrome = () => {
        // Freecam owns the screen — park creative chrome until exit.
        const show = creativeWanted && !freecamActive;
        creative.setActive(show);
        creativeControl.setCreativeActive(creativeWanted);
        // Crafting is survival-only; hide in creative and freecam.
        gui.craftingMenu.container.visible =
            !creativeWanted && !freecamActive;
        refreshModeAvailability();
    };

    const setFreecamUi = (enabled: boolean) => {
        hideTooltip();
        freecamActive = enabled;
        world.setFreecamMode(enabled);
        // Keep hotbar + vitals as a grayed ghost; park crafting only.
        gui.setFreecamDimmed(enabled);
        editor.setActive(enabled);
        freecamControl.setFreecamActive(enabled);
        syncCreativeChrome();
    };

    receiver.on(ServerPacket.FreecamMode, ({ enabled }) => {
        setFreecamUi(enabled);
    });

    receiver.on(ServerPacket.CreativeMode, (packet) => {
        creativeWanted = packet.enabled;
        creative.applyServerState(packet);
        syncCreativeChrome();
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
        hideGameOver();
        setMenuVisible(true);
    });
    gameOverRespawnButton.addEventListener("click", () => {
        hideGameOver();
        session.connect();
    });
    gameOverMenuButton.addEventListener("click", () => {
        hideGameOver();
        setMenuVisible(true);
        nameInput.focus();
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
        isUseBlocked: (kind) => {
            if (kind === "attack" || kind === "place") {
                return gui.inventory.denyAction(
                    gui.inventory.equippedMainHand,
                    "use"
                );
            }
            // Block / eat — prefer off-hand, also flash if any equipped use-lock.
            if (
                gui.inventory.denyAction(gui.inventory.equippedOffHand, "use")
            ) {
                return true;
            }
            return (
                gui.inventory.denyAction(
                    gui.inventory.equippedMainHand,
                    "use"
                ) ||
                gui.inventory.denyAction(gui.inventory.equippedHelmet, "use")
            );
        },
    });
    input.bindChat(chat);
    bindDebugChat?.(chat, (handler) => {
        input.onClientChatCommand = handler;
    });
    input.onToggleLeaderboard = () => gui.leaderboard.toggle();
    input.onShowWorldHover = (show) => world.setShowAllHover(show);
    world.onPlacementValidity = (allowed) => input.onPlacementValidity(allowed);
    world.onLocalEquipment = (mainhand, offhand, helmet) => {
        gui.inventory.setEquipment(mainhand, offhand, helmet);
    };

    gui.inventory.isLocked = () => {
        const local = world.objects.get(world.user ?? -1);
        return local instanceof Player && local.isCrafting;
    };
    gui.inventory.onLockFlash = (lock) => {
        const local = world.objects.get(world.user ?? -1);
        if (!(local instanceof Player)) return;
        local.flashLockHud(lock.endsAt, lock.durationMs);
        world.objects.updating.add(local);
    };
    gui.inventory.onSelect = (slot) => {
        const itemId = gui.inventory.slots[slot]?.[0];
        gui.inventory.notifySelectDenied(itemId);
        session.sendPacket(ClientPacket.SelectItem, { slot });
    };
    gui.inventory.creativeReplace = () => creative.isActive();
    gui.inventory.isVoidTarget = (screenX, screenY) =>
        creative.isSidebarHit(screenX, screenY);
    gui.inventory.onVoid = (slot) => {
        session.sendPacket(ClientPacket.CreativeVoid, { slot });
    };
    gui.inventory.onMove = (from, to) => {
        session.sendPacket(ClientPacket.MoveSlot, { from, to });
    };
    gui.inventory.onCursor = (slot, mode) => {
        session.sendPacket(ClientPacket.CursorSlot, { slot, mode });
    };
    gui.inventory.onWorldDrop = (originGlobal, buttonScale) => {
        const origin = viewport.toLocal(originGlobal);
        const vpScale = Math.abs(viewport.scale.x) || 1;
        const iconScreen = percentOf(90, ITEM_BUTTON_SIZE) * buttonScale;
        const startScale = iconScreen / (GROUND_ITEM_SIZE * vpScale);
        world.queueLocalDrop(new Point(origin.x, origin.y), startScale);
    };
    gui.craftingMenu.leftclick = (recipeId) => {
        const local = world.objects.get(world.user ?? -1);
        if (local instanceof Player && local.isCrafting) return;
        const lockedIngredient = gui.recipeManager.craftLockedIngredient(
            recipeId,
            (itemId) => gui.inventory.isActionLocked(itemId, "craft")
        );
        if (lockedIngredient !== undefined) {
            gui.inventory.flashItemLock(lockedIngredient);
            const button = gui.craftingMenu.buttons.find(
                (_, i) => gui.craftingMenu.items[i]?.recipeId === recipeId
            );
            button?.flashLock();
            return;
        }
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
        layoutModeControls();
        editor.tick(now);
        creative.tick?.(now);
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
        freecamControl.destroy();
        gui.destroy();
        tooltip.destroy();
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
