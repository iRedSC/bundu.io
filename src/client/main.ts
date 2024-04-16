import { radians, lookToward, degrees } from "../lib/transforms";
import { KeyboardInputListener } from "./input/keyboard";
import { World } from "./world/world";
import {
    CLIENT_ACTION,
    CLIENT_PACKET_TYPE,
    PACKET_TYPE,
    ServerPacketSchema,
} from "../shared/enums";
import { PacketParser } from "../shared/unpack";
import { createPipeline } from "./network/packet_pipline";
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

// create a packet pipeline and world
const parser = new PacketParser();
const world = new World(viewport, animationManager);
createPipeline(parser, world);

// list of ids that the server sent updates for but the client doesn't have
export let requestIds: number[] = [];

// create a socket handler
// this wraps a WebSocket and allows for the setup of methods without
// connecting.
const socket = new SocketHandler();
socket.onopen = () => {
    const nameInput = document.getElementById("name-input") as HTMLInputElement;
    const name = nameInput.value;
    socket.send([CLIENT_PACKET_TYPE.JOIN, [name || "unnamed", 0, 0, 0]]);
};

socket.onmessage = async (ev) => {
    const data = await decodeFromBlob(ev.data);
    // console.log(Date.now(), data);
    parser.unpack(data);
};

// add some packets to the unpacker
parser.set(
    PACKET_TYPE.PING,
    ServerPacketSchema.ping,
    (_: ServerPacketSchema.ping) => {}
);

parser.set(
    PACKET_TYPE.DRAW_POLYGON,
    ServerPacketSchema.drawPolygon,
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
const mouse = new MouseInputListener(mouseMoveCallback);

// send movement packet to the server
// this is a callback function
function moveUpdate(move: [number, number]) {
    if (keyboard.chatOpen) {
        return;
    }
    move[0] = Math.max(0, Math.min(2, move[0]));
    move[1] = Math.max(0, Math.min(2, move[1]));
    const dir = (move[0] << 2) | move[1];
    socket.send([CLIENT_PACKET_TYPE.MOVE_UPDATE, dir + 1]);
}

// sends a rotation update packet to the server
// only sends if the movement was significant or 10 attempts
let updateTick = 0;
function mouseMoveCallback(mousePos: [number, number]) {
    const player = world.objects.get(world.user || -1);
    if (player) {
        let mouseToWorld = viewport.toWorld(mousePos[0], mousePos[1]);
        const rotation =
            lookToward(player.position, mouseToWorld) - radians(90);
        updateTick++;
        if (Math.abs(player.rotation - rotation) > 0.1 || updateTick > 5) {
            updateTick = 0;
            socket.send([CLIENT_PACKET_TYPE.ROTATE, round(degrees(rotation))]);
        }
        player.rotation = rotation;
    }
}

// send attack/block action when the user clicks on the viewport
viewport.addEventListener("pointerdown", (event) => {
    if (event.button === 2) {
        socket.send([CLIENT_PACKET_TYPE.ACTION, [CLIENT_ACTION.BLOCK, false]]);
    }
    if (event.button === 0) {
        socket.send([CLIENT_PACKET_TYPE.ACTION, [CLIENT_ACTION.ATTACK, false]]);
    }
    viewport;
});

viewport.addEventListener("pointerup", (event) => {
    if (event.button == 2) {
        socket.send([CLIENT_PACKET_TYPE.ACTION, [CLIENT_ACTION.BLOCK, true]]);
    }
    if (event.button === 0) {
        socket.send([CLIENT_PACKET_TYPE.ACTION, [CLIENT_ACTION.ATTACK, true]]);
    }
});

// callback for when a chat message is sent.
function chat(message: string) {
    socket.send([CLIENT_PACKET_TYPE.CHAT_MESSAGE, message]);
}

// request unknown object ids on interval
setInterval(() => {
    if (requestIds.length > 0) {
        socket.send([CLIENT_PACKET_TYPE.REQUEST_OBJECT, requestIds]);
        requestIds = [];
    }
}, 500);

// create ui and elements
const { ui, inventory, craftingMenu, recipeManager, health, hunger, heat } =
    createUI();

health.start(animationManager);
hunger.start(animationManager);
heat.start(animationManager);

parser.set(
    PACKET_TYPE.UPDATE_STATS,
    ServerPacketSchema.updateStats,
    (packet: ServerPacketSchema.updateStats) => {
        console.log(packet);
        health.update(packet[0], animationManager);
        hunger.update(packet[1], animationManager);
        heat.update(packet[2], animationManager);
    }
);

const craftItemCB = (item: number) => {
    socket.send([CLIENT_PACKET_TYPE.CRAFT_ITEM, item]);
};

craftingMenu.setCallbacks(craftItemCB, craftItemCB);

parser.set(
    PACKET_TYPE.CRAFTING_RECIPES,
    ServerPacketSchema.craftingRecipes,
    recipeManager.updateRecipes.bind(recipeManager)
);

parser.set(
    PACKET_TYPE.UPDATE_INVENTORY,
    ServerPacketSchema.updateInventory,
    (packet: ServerPacketSchema.updateInventory) => {
        inventory.update(packet);
        craftingMenu.items = recipeManager.filter(inventory.slots, []);
        craftingMenu.update();
    }
);

const inventoryLeftClickCB = (item: number) => {
    socket.send([CLIENT_PACKET_TYPE.SELECT_ITEM, item]);
};

const inventoryRightClickCB = (item: number, shift: boolean = false) => {
    socket.send([CLIENT_PACKET_TYPE.DROP_ITEM, [item, shift]]);
};

inventory.display.setCallbacks(inventoryLeftClickCB, inventoryRightClickCB);

app.stage.addChild(ui);

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
