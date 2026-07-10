import { Application, type Renderer } from "pixi.js";
import {
    receiver,
    setupGUIPacketReceiving,
    setupPacketReceiving,
} from "./network/receiver";
import { ClientPacket } from "@bundu/shared/packet_definitions";
import { World } from "./world/world";
import { createViewport } from "./rendering/viewport";
import { createUI } from "./ui/ui";
import { initAssets } from "./assets/load";
import { AnimationManagers } from "./animation/animations";
import { InputController } from "./input/controller";
import { serverTime } from "./globals";
import { Player } from "./world/objects/player";
import { GameSession } from "./session/game_session";

declare const __DEBUG__: boolean;

declare namespace globalThis {
    var __PIXI_APP__: Application;
}

const GAME_WS_URL =
    process.env.GAME_WS_URL ?? "ws://localhost:7777";

type ClientDebugHandle = {
    getPlaceStructureId(): number | null;
};

const app = new Application<Renderer<HTMLCanvasElement>>();
globalThis.__PIXI_APP__ = app;

function setMenuVisible(visible: boolean) {
    document.querySelectorAll(".menu").forEach((item) => {
        item.classList.toggle("hidden", !visible);
    });
}

function buildSocketUrl(username: string) {
    const url = new URL(GAME_WS_URL);
    url.searchParams.set("username", username || "unnamed");
    url.searchParams.set("skin_id", "0");
    return url.toString();
}

async function main() {
    await initAssets();

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
    let debug: ClientDebugHandle = { getPlaceStructureId: () => null };
    if (__DEBUG__) {
        const { mountClientDebug } = await import("./debug/tools");
        debug = mountClientDebug(viewport);
        const { initDevtools } = await import("@pixi/devtools");
        await initDevtools({ app });
    }

    const world = new World(viewport);
    setupPacketReceiving(receiver, world);

    // * GUI
    const gui = createUI();
    app.stage.addChild(gui.container);
    setupGUIPacketReceiving(receiver, gui);

    const nameInput = document.getElementById("name-input") as HTMLInputElement;
    const playButton = document.getElementById(
        "play-button"
    ) as HTMLButtonElement;

    const session = new GameSession(receiver, {
        buildSocketUrl,
        getUsername: () => nameInput.value.trim(),
        resetLocalState: () => {
            world.clear();
            gui.health.update(0);
            gui.hunger.update(0);
            gui.heat.update(0);
            gui.inventory.update({ items: [] });
            gui.recipeManager.recipes.clear();
            gui.craftingMenu.items = [];
            gui.craftingMenu.update();
            input.closeChat();
            serverTime.synced = false;
            serverTime.offset = 0;
            serverTime.targetOffset = 0;
        },
        setConnecting: (connecting) => {
            playButton.disabled = connecting;
        },
        onConnected: () => setMenuVisible(false),
        onDisconnected: () => {
            setMenuVisible(true);
            nameInput.focus();
        },
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
        isInGame: () => session.isInGame(),
        getPlaceStructureId: () => debug.getPlaceStructureId(),
    });

    gui.inventory.leftclick = (itemId) => {
        session.sendPacket(ClientPacket.SelectItem, { itemId });
    };
    gui.inventory.rightclick = (itemId, shift) => {
        session.sendPacket(ClientPacket.DropItem, { itemId, dropAll: shift });
    };
    gui.craftingMenu.leftclick = (itemId) => {
        session.sendPacket(ClientPacket.CraftItem, { itemId });
    };

    app.canvas.oncontextmenu = () => {};
    document.body.appendChild(app.canvas);

    viewport.sortChildren();

    playButton.addEventListener("click", (event) => {
        event.preventDefault();
        session.connect();
    });
    nameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            session.connect();
        }
    });
    nameInput.focus();

    app.ticker.add(() => {
        world.tick();
        AnimationManagers.UI.update();
        gui.tick();
    });
}

main();
