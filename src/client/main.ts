import { radians, lookToward, degrees } from "../lib/transforms";
import { KeyboardInputListener } from "./input/keyboard";
import { World } from "./world/world";
import {
    CLIENT_ACTION,
    CLIENT_PACKET_TYPE,
    PACKET_TYPE,
    ServerPacketSchema,
} from "../shared/enums";
import { PacketPipeline, Unpacker } from "../shared/unpack";
import { createPipeline } from "./packet_pipline";
import { debugContainer, drawPolygon } from "./debug";
import { round } from "../lib/math";
import { decodeFromBlob } from "./network/decode";
import { Container, Point } from "pixi.js";
import { MouseInputListener } from "./input/mouse";
import { createPixiApp } from "./rendering/app";
import { createViewport } from "./rendering/viewport";
import { AnimationManager } from "../lib/animations";
import { createUI } from "./ui/ui";
import { SocketHandler } from "./network/socket_handler";
import { an } from "vitest/dist/reporters-5f784f42.js";

export const animationManager = new AnimationManager();

const UI = new Container();

const app = createPixiApp();
app.view.classList.add("canvas");
document.body.appendChild(app.view);
const viewport = createViewport(app, new Point(0, 0));
app.view.oncontextmenu = () => {
    return false;
};

app.stage.addChild(viewport);
app.stage.addChild(UI);

const packetPipeline = new PacketPipeline();
const world = new World(viewport, animationManager);

// viewport.addChild(debugContainer);
debugContainer.zIndex = 1000;
viewport.sortChildren();

createPipeline(packetPipeline, world);

export let requestIds: number[] = [];

packetPipeline.unpackers[PACKET_TYPE.PING] = new Unpacker(
    (_: ServerPacketSchema.ping) => {},
    ServerPacketSchema.ping
);

packetPipeline.unpackers[PACKET_TYPE.DRAW_POLYGON] = new Unpacker(
    drawPolygon,
    ServerPacketSchema.drawPolygon
);

const socket = new SocketHandler();
socket.onopen = () => {
    const nameInput = document.getElementById("name-input") as HTMLInputElement;
    const name = nameInput.value;
    socket.send([CLIENT_PACKET_TYPE.JOIN, [name || "unnamed", 0, 0, 0]]);
};

socket.onmessage = async (ev) => {
    const data = await decodeFromBlob(ev.data);
    // console.log(Date.now(), data);
    packetPipeline.unpack(data);
};

// tick updates

function tick() {
    world.tick();
    requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

const keyboard = new KeyboardInputListener(moveUpdate, chat);
const mouse = new MouseInputListener(mouseMoveCallback);

function moveUpdate(move: [number, number]) {
    if (keyboard.chatOpen) {
        return;
    }
    move[0] = Math.max(0, Math.min(2, move[0]));
    move[1] = Math.max(0, Math.min(2, move[1]));
    const dir = (move[0] << 2) | move[1];
    socket.send([CLIENT_PACKET_TYPE.MOVE_UPDATE, dir + 1]);
}

let updateTick = 0;
function mouseMoveCallback(mousePos: [number, number]) {
    const player = world.dynamicObjs.get(world.user || -1);
    if (player) {
        let mouseToWorld = viewport.toWorld(mousePos[0], mousePos[1]);
        const rotation =
            lookToward(player.position, mouseToWorld) - radians(90);
        updateTick++;
        if (Math.abs(player.rotation - rotation) > 0.2 || updateTick > 10) {
            updateTick = 0;
            socket.send([CLIENT_PACKET_TYPE.ROTATE, round(degrees(rotation))]);
        }
        player.rotation = rotation;
    }
}

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

function chat(message: string) {
    console.log(message);
}

// interactions

setInterval(() => {
    if (requestIds.length > 0) {
        socket.send([CLIENT_PACKET_TYPE.REQUEST_OBJECT, requestIds]);
        requestIds = [];
    }
}, 500);

const { ui, inventory, craftingMenu, recipeManager, health } = createUI();

health.update(2000, animationManager);
health.start(animationManager);

setInterval(() => {
    health.update(health.amount - 100, animationManager);
}, 500);

craftingMenu.setCallback((item: number) => {
    socket.send([CLIENT_PACKET_TYPE.CRAFT_ITEM, item]);
});

packetPipeline.unpackers[PACKET_TYPE.CRAFTING_RECIPES] = new Unpacker(
    recipeManager.updateRecipes.bind(recipeManager),
    ServerPacketSchema.craftingRecipes
);

packetPipeline.unpackers[PACKET_TYPE.UPDATE_INVENTORY] = new Unpacker(
    (packet) => {
        inventory.update(packet);
        craftingMenu.items = recipeManager.filter(inventory.slots, []);
        craftingMenu.update();
    },
    ServerPacketSchema.updateInventory
);

inventory.callback = (item: number) => {
    socket.send([CLIENT_PACKET_TYPE.SELECT_ITEM, item]);
};

app.stage.addChild(ui);

document.querySelector("button")?.addEventListener("click", () => {
    const ws = new WebSocket("ws://localhost:7777");
    socket.connect(ws);

    document
        .querySelectorAll(".menu")
        .forEach((item) => item.classList.add("hidden"));
});
