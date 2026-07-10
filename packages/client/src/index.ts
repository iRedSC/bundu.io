import { Application, type Renderer } from "pixi.js";
import { decodeFromBlob } from "./network/decode";
import type { SerializedPacketArray } from "./network/client_receiver";
import {
    receiver,
    setupGUIPacketReceiving,
    setupPacketReceiving,
} from "./network/receiver";
import {
    ClientPacket,
    Schema,
    type ClientPacketMap,
} from "@bundu/shared/packet_definitions";
import { serializer } from "./network/serializer";
import { Socket } from "./network/socket";
import { World } from "./world/world";
import { createViewport } from "./rendering/viewport";
import { debugContainer } from "./rendering/debug";
import { createUI } from "./ui/ui";
import { initAssets } from "./assets/load";
import { AnimationManagers } from "./animation/animations";
import { initDevtools } from "@pixi/devtools";
import { InputController } from "./input/controller";
import { serverTime } from "./globals";
import { Player } from "./world/objects/player";

function isPacketArray(data: unknown): data is SerializedPacketArray {
    return Array.isArray(data) && typeof data[0] === "number";
}

declare namespace globalThis {
    var __PIXI_APP__: Application;
}

const GAME_WS_URL =
    process.env.GAME_WS_URL ?? "ws://localhost:7777";

const app = new Application<Renderer<HTMLCanvasElement>>();
globalThis.__PIXI_APP__ = app;

type GameSocket = Socket<typeof Schema.Client, ClientPacketMap>;

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
    initDevtools({ app });
    const viewport = createViewport(app);
    app.stage.addChild(viewport);

    viewport.addChild(debugContainer);

    const world = new World(viewport);
    setupPacketReceiving(receiver, world);

    // * GUI
    const gui = createUI();
    app.stage.addChild(gui.container);
    setupGUIPacketReceiving(receiver, gui);

    let socket: GameSocket | null = null;
    let connecting = false;

    const sendPacket: GameSocket["sendPacket"] = (id, data) => {
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        socket.sendPacket(id, data);
    };

    const debugToggle = document.querySelector<HTMLButtonElement>("#debug-toggle");
    if (debugToggle) {
        const setDebugVisible = (visible: boolean) => {
            debugContainer.visible = visible;
            debugToggle.textContent = `Debug: ${visible ? "On" : "Off"}`;
            debugToggle.ariaPressed = String(visible);
        };

        debugToggle.addEventListener("pointerdown", (event) =>
            event.stopPropagation()
        );
        debugToggle.addEventListener("pointerup", (event) =>
            event.stopPropagation()
        );
        debugToggle.addEventListener("click", (event) => {
            event.stopPropagation();
            setDebugVisible(!debugContainer.visible);
        });
        setDebugVisible(debugContainer.visible);
    }

    // * Keyboard / mouse inputs
    const input = new InputController(sendPacket, {
        getLocalPlayer: () => {
            const object = world.objects.get(world.user ?? -1);
            return object instanceof Player ? object : undefined;
        },
        markUpdating: (player) => {
            world.objects.updating.add(player);
        },
        screenToWorld: (screenX, screenY) =>
            viewport.toLocal({ x: screenX, y: screenY }),
        isInGame: () =>
            socket !== null && socket.readyState === WebSocket.OPEN,
    });

    const resetSession = () => {
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
    };

    gui.inventory.leftclick = (itemId) => {
        sendPacket(ClientPacket.SelectItem, { itemId });
    };
    gui.inventory.rightclick = (itemId, shift) => {
        sendPacket(ClientPacket.DropItem, { itemId, dropAll: shift });
    };
    gui.craftingMenu.leftclick = (itemId) => {
        sendPacket(ClientPacket.CraftItem, { itemId });
    };

    app.canvas.oncontextmenu = () => {};
    document.body.appendChild(app.canvas);

    viewport.sortChildren();

    const nameInput = document.getElementById("name-input") as HTMLInputElement;
    const playButton = document.getElementById(
        "play-button"
    ) as HTMLButtonElement;

    const connect = () => {
        if (connecting) return;
        if (socket && socket.readyState === WebSocket.OPEN) return;

        connecting = true;
        playButton.disabled = true;
        resetSession();

        if (socket) {
            socket.onopen = null;
            socket.onclose = null;
            socket.onmessage = null;
            socket.onerror = null;
            if (
                socket.readyState === WebSocket.OPEN ||
                socket.readyState === WebSocket.CONNECTING
            ) {
                socket.close();
            }
        }

        const next = new Socket(buildSocketUrl(nameInput.value.trim()), serializer);
        socket = next;

        next.onmessage = async (ev) => {
            const data = await decodeFromBlob(ev.data);
            if (socket !== next) return;
            if (!isPacketArray(data)) return;
            receiver.process(data);
        };

        next.onopen = () => {
            if (socket !== next) return;
            connecting = false;
            playButton.disabled = false;
            setMenuVisible(false);
        };

        next.onerror = () => {
            // Non-terminal: let onclose own session cleanup.
            if (socket !== next) return;
            connecting = false;
            playButton.disabled = false;
        };

        next.onclose = () => {
            connecting = false;
            playButton.disabled = false;
            if (socket !== next) return;
            socket = null;
            resetSession();
            setMenuVisible(true);
            nameInput.focus();
        };
    };

    playButton.addEventListener("click", (event) => {
        event.preventDefault();
        connect();
    });
    nameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            connect();
        }
    });

    setMenuVisible(true);
    nameInput.focus();

    app.ticker.add(() => {
        const player = world.objects.get(world.user ?? -1);
        if (player) {
            world.tick();
            gui.tick();
            AnimationManagers.UI.update();
        }
        const adjustmentRate = 0.1;
        serverTime.offset +=
            (serverTime.targetOffset - serverTime.offset) * adjustmentRate;
    });
}

main();
