import { Application, type Renderer } from "pixi.js";
import { decodeFromBlob } from "./network/decode";
import typia from "typia";
import type { SerializedPacketArray } from "./network/client_receiver";
import { receiver, setupPacketReceiving } from "./network/receiver";
import { ClientPacket } from "@shared/packet_definitions";
import { serializer } from "./network/serializer";
import { Socket } from "./network/socket";
import { World } from "./world/world";
import { createViewport } from "./rendering/viewport";
import { debugContainer } from "./rendering/debug";
import { createUI } from "./ui/ui";
import { decode } from "@msgpack/msgpack";
import { initAssets } from "./assets/load";
import { AnimationManagers } from "./animation/animations";
import { initDevtools } from "@pixi/devtools";
import { MouseInputListener } from "./input/mouse";
import { round, degrees, lookToward, radians } from "@ioengine/lib";
import { KeyboardInputListener } from "./input/keyboard";
import { serverTime } from "./globals";

declare namespace globalThis {
    var __PIXI_APP__: Application;
}

const app = new Application<Renderer<HTMLCanvasElement>>();
globalThis.__PIXI_APP__ = app;

async function main() {
    await initAssets();
    const socket = new Socket("ws://localhost:7777", serializer);

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

    // ? Manually dispatching resize event, find out why
    const resize = new Event("resize");
    setTimeout(() => window.dispatchEvent(resize), 500);

    // * GUI
    const gui = createUI();
    app.stage.addChild(gui.container);

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

    // * Keyboard inputs
    const mouse = new MouseInputListener();
    let updateTick: number = 0;
    mouse.onMouseMove = (mousePos: [number, number]) => {
        const player = world.objects.get(world.user || -1);
        if (player) {
            let mouseToWorld = viewport.toLocal({
                x: mousePos[0],
                y: mousePos[1],
            });
            const rotation =
                lookToward(player.position, mouseToWorld) - radians(90);
            updateTick++;
            if (Math.abs(player.rotation - rotation) > 0.1 || updateTick > 5) {
                updateTick = 0;
                socket.sendPacket(ClientPacket.Rotation, {
                    rotation: round(degrees(rotation)),
                });
            }
            world.objects.updating.add(player);
            player.addState(rotation);
        }
    };

    const keyboard = new KeyboardInputListener();
    keyboard.onMoveInput = (move: [number, number]) => {
        const chat = document.querySelector<HTMLInputElement>("#chat-input")!;
        if (chat === document.activeElement) {
            return;
        }
        move[0] = Math.max(0, Math.min(2, move[0]));
        move[1] = Math.max(0, Math.min(2, move[1]));
        const dir = (move[0] << 2) | move[1];
        socket.sendPacket(ClientPacket.Movement, { direction: dir + 1 });
    };

    document.addEventListener("pointerdown", (event) => {
        if (event.button === 2) {
            socket.sendPacket(ClientPacket.Block, { stop: false });
            console.log(`Starting block`);
        }
        if (event.button === 0)
            socket.sendPacket(ClientPacket.Attack, { stop: false });
    });

    document.addEventListener("pointerup", (event) => {
        if (event.button === 2)
            socket.sendPacket(ClientPacket.Block, { stop: true });
        if (event.button === 0)
            socket.sendPacket(ClientPacket.Attack, { stop: true });
    });

    app.canvas.oncontextmenu = () => {};
    document.body.appendChild(app.canvas);

    viewport.sortChildren();

    socket.onmessage = async (ev) => {
        const data = await decodeFromBlob(ev.data);
        if (!typia.is<SerializedPacketArray>(data)) return;
        receiver.process(data);
    };

    document
        .querySelectorAll(".menu")
        .forEach((item) => item.classList.add("hidden"));

    const nameInput = document.getElementById("name-input") as HTMLInputElement;
    const name = nameInput.value;

    socket.onopen = () => {};

    socket.onclose = () => {
        document
            .querySelectorAll(".menu")
            .forEach((item) => item.classList.remove("hidden"));
    };

    setInterval(() => {
        if (world.requestIds.size > 0) {
            console.log(`Requesting IDs: ${Array.from(world.requestIds)}`);
            socket.sendPacket(ClientPacket.RequestObjects, {
                objects: Array.from(world.requestIds),
            });
            world.requestIds.clear();
        }
    }, 500);

    // setInterval(() => {
    //     serverTime.pingTimeStart = performance.now();
    //     socket.sendPacket(ClientPacket.Ping, {});
    // }, 1000);

    app.ticker.add((ticker) => {
        const player = world.objects.get(world.user ?? -1);
        if (player) {
            world.tick();
            AnimationManagers.UI.update();
        }
        const adjustmentRate = 0.1;
        serverTime.offset +=
            (serverTime.targetOffset - serverTime.offset) * adjustmentRate;
    });
}

main();
