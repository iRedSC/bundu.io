import { radians, lookToward, degrees } from "../lib/transforms";
import { KeyboardInputListener } from "./input/keyboard";
import { World } from "./world/world";
import { PACKET, SCHEMA } from "../shared/enums";
import { PacketParser } from "../shared/unpack";
import { createParser } from "./network/packet_pipline";
import { debugContainer, drawPolygon } from "./rendering/debug";
import { round } from "../lib/math";
import { decodeFromBlob } from "./network/decode";
import { Point } from "pixi.js";
import { MouseInputListener } from "./input/mouse";
import { createPixiApp } from "./rendering/app";
import { createViewport } from "./rendering/viewport";
import { AnimationManager } from "../lib/animations";
import { createUI } from "./ui/ui";
import { SocketHandler } from "./network/socket_handler";
import { validate } from "../shared/type_guard";
import { z } from "zod";

export const animationManager = new AnimationManager();

// create pixi.js app and add it to the document.
const app = createPixiApp();
app.view.classList.add("canvas");
document.body.appendChild(app.view);

// create pixi viewport and add it to app.
const viewport = createViewport(app, new Point(0, 0));
app.view.oncontextmenu = () => {
    return false;
};
app.stage.addChild(viewport);

// add debug container to the viewport (shows hitboxes and ids)
// viewport.addChild(debugContainer);
debugContainer.zIndex = 1000;
viewport.sortChildren();

// list of ids that the server sent updates for but the client doesn't have
export let requestIds: Set<number> = new Set();

// create a socket handler
// this wraps a WebSocket and allows for the setup of methods without
// connecting.
const socket = new SocketHandler();

const inventoryLeftClickCB = (item: number) => {
    socket.send([PACKET.CLIENT.SELECT_ITEM, item]);
};

const inventoryRightClickCB = (item: number, shift: boolean = false) => {
    socket.send([PACKET.CLIENT.DROP_ITEM, [item, shift]]);
};

// sends a rotation update packet to the server
// only sends if the movement was significant or 10 attempts
let updateTick = 0;
function mouseMoveCallback(world: World, mousePos: [number, number]) {
    const player = world.objects.get(world.user || -1);
    if (player) {
        let mouseToWorld = viewport.toWorld(mousePos[0], mousePos[1]);
        const rotation =
            lookToward(player.position, mouseToWorld) - radians(90);
        updateTick++;
        if (Math.abs(player.rotation - rotation) > 0.1 || updateTick > 5) {
            updateTick = 0;
            socket.send([PACKET.CLIENT.ROTATE, round(degrees(rotation))]);
        }
        player.rotation = rotation;
    }
}

// send movement packet to the server
// this is a callback function
function moveUpdate(move: [number, number]) {
    const chat = document.querySelector<HTMLInputElement>("#chat-input")!;
    if (chat === document.activeElement) {
        return;
    }
    move[0] = Math.max(0, Math.min(2, move[0]));
    move[1] = Math.max(0, Math.min(2, move[1]));
    const dir = (move[0] << 2) | move[1];
    socket.send([PACKET.CLIENT.MOVE_UPDATE, dir + 1]);
}

// send attack/block action when the user clicks on the viewport
viewport.addEventListener("pointerdown", (event) => {
    if (event.button === 2) {
        socket.send([PACKET.CLIENT.ACTION, [PACKET.ACTION.BLOCK, false]]);
    }
    if (event.button === 0) {
        socket.send([PACKET.CLIENT.ACTION, [PACKET.ACTION.ATTACK, false]]);
    }
    viewport;
});

viewport.addEventListener("pointerup", (event) => {
    if (event.button == 2) {
        socket.send([PACKET.CLIENT.ACTION, [PACKET.ACTION.BLOCK, true]]);
    }
    if (event.button === 0) {
        socket.send([PACKET.CLIENT.ACTION, [PACKET.ACTION.ATTACK, true]]);
    }
});

// request unknown object ids on interval
setInterval(() => {
    if (requestIds.size > 0) {
        socket.send([PACKET.CLIENT.REQUEST_OBJECTS, Array.from(requestIds)]);
        requestIds.clear();
    }
}, 500);

// callback for when a chat message is sent.
function chat(message: string) {
    socket.send([PACKET.CLIENT.CHAT_MESSAGE, message]);
}

// create ui and elements
const { ui, inventory, craftingMenu, recipeManager, health, hunger, heat } =
    createUI();

health.start(animationManager);
hunger.start(animationManager);
heat.start(animationManager);

const craftItemCB = (item: number) => {
    socket.send([PACKET.CLIENT.CRAFT_ITEM, item]);
};

craftingMenu.setCallbacks(craftItemCB, craftItemCB);

inventory.display.setCallbacks(inventoryLeftClickCB, inventoryRightClickCB);

app.stage.addChild(ui);

socket.onopen = () => {
    animationManager.clear();
    requestIds.clear();
    inventory.update([10, []]);

    // create a packet pipeline and world
    const parser = new PacketParser();
    const world = new World(viewport, animationManager);
    createParser(parser, world);

    socket.onmessage = async (ev) => {
        const data = await decodeFromBlob(ev.data);
        if (!validate(data, z.array(z.any()))) {
            return;
        }
        parser.unpackMany(data);
    };

    // add some packets to the unpacker
    parser.set(
        PACKET.SERVER.PING,
        SCHEMA.SERVER.PING,
        (_: SCHEMA.SERVER.PING) => {}
    );

    parser.set(
        PACKET.SERVER.DRAW_POLYGON,
        SCHEMA.SERVER.DRAW_POLYGON,
        drawPolygon
    );

    // tick updates
    function tick() {
        world.tick();
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    // keyboard and mouse listeners
    const keyboard = new KeyboardInputListener(moveUpdate, chat);
    const mouse = new MouseInputListener(
        mouseMoveCallback.bind(mouseMoveCallback, world)
    );

    parser.set(
        PACKET.SERVER.UPDATE_STATS,
        SCHEMA.SERVER.UPDATE_STATS,
        (packet: SCHEMA.SERVER.UPDATE_STATS) => {
            console.log(packet);
            health.update(packet[0], animationManager);
            hunger.update(packet[1], animationManager);
            heat.update(packet[2], animationManager);
        }
    );

    parser.set(
        PACKET.SERVER.CRAFTING_RECIPES,
        SCHEMA.SERVER.CRAFTING_RECIPES,
        recipeManager.updateRecipes.bind(recipeManager)
    );

    parser.set(
        PACKET.SERVER.UPDATE_INVENTORY,
        SCHEMA.SERVER.UPDATE_INVENTORY,
        (packet: SCHEMA.SERVER.UPDATE_INVENTORY) => {
            inventory.update(packet);
            craftingMenu.items = recipeManager.filter(inventory.slots, []);
            craftingMenu.update();
        }
    );

    const nameInput = document.getElementById("name-input") as HTMLInputElement;
    const name = nameInput.value;
    socket.send([PACKET.CLIENT.JOIN, [name || "unnamed", 0, 0]]);
};

socket.onclose = () => {
    document
        .querySelectorAll(".menu")
        .forEach((item) => item.classList.remove("hidden"));
    socket.socket = undefined;
};

// when the menu button is clicked, connect to the websocket and hide them menu.
document.querySelector("button")?.addEventListener("click", () => {
    const ws = new WebSocket("ws://localhost:7777");
    socket.connect(ws);

    document
        .querySelectorAll(".menu")
        .forEach((item) => item.classList.add("hidden"));

    const resize = new Event("resize");
    window.dispatchEvent(resize);
});
