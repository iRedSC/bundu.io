import { World } from "./world/world";
import { PacketParser } from "../shared/unpack";
import { debugContainer } from "./rendering/debug";
import { Container } from "pixi.js";
import { encode } from "@msgpack/msgpack";
import { decodeFromBlob } from "./network/decode";
import { validate } from "../shared/type_guard";
import { z } from "zod";
import { createUI } from "./ui/ui";
import { KeyboardInputListener } from "./input/keyboard";
import { MouseInputListener } from "./input/mouse";
import { PACKET } from "../shared/enums";
import { degrees, lerp, lookToward, radians } from "../lib/transforms";
import { round } from "../lib/math";
import random from "../lib/random";
import { AnimationManagers } from "./animation/animations";
import { Player } from "./world/objects/player";
import { setupUIParser, setupWorldParser } from "./network/packet_pipline";
import { PixiApp } from "./rendering/app";
import Stats from "stats.js";
import { Camera } from "./rendering/camera";
// import { ReflectionFilter } from "@pixi/filter-reflection";

let socket: WebSocket;

function send(message: unknown) {
    if (socket) socket.send(encode(message));
}

// create pixi.js app and add it to the document.
const app = PixiApp.app;
app.view.classList.add("canvas");
document.body.appendChild(app.view);

// create pixi viewport and add it to app.
// const viewport = createViewport(app, new Point(0, 0));
const viewport = new Container();
app.view.oncontextmenu = () => {
    return false;
};
app.stage.addChild(viewport);

const camera = new Camera(viewport, {
    // worldWidth: 20000,

    // worldHeight: 20000,

    ticker: app.ticker,

    zoomSpeed: 0.05,
    minZoom: 0.75,
    maxZoom: 2.5,
    // autoZoom: true,

    padding: 100,

    speed: 0.05,
    // peek: 0.1,
    // deadZone: 25,
});

// add debug container to the viewport (shows hitboxes and ids)
// viewport.addChild(debugContainer);
debugContainer.zIndex = 1000;
viewport.sortChildren();

const world = new World(viewport);
const parser = new PacketParser();
setupWorldParser(parser, world);

world.addEventListener("set_user", (player) => {
    camera.targets = [player.position];
    camera.snap();
});

// world.addEventListener("new_player", (player) => {
//     camera.targets.push(player.position);
// });

// setInterval(() => {
//     const user = world.getUser();
//     if (!user) return;
//     const query = world.objects.query([
//         { x: user.position.x - 500, y: user.position.y - 500 },
//         { x: user.position.x + 500, y: user.position.y + 500 },
//     ]);
//     camera.targets = query.map((id) => world.objects.get(id)!.position);
// });

const resize = new Event("resize");
setTimeout(() => window.dispatchEvent(resize), 50);

// create ui and elements
const ui = createUI();
setupUIParser(parser, ui);

const keyboard = new KeyboardInputListener();

keyboard.onMoveInput = (move: [number, number]) => {
    const chat = document.querySelector<HTMLInputElement>("#chat-input")!;
    if (chat === document.activeElement) {
        return;
    }
    move[0] = Math.max(0, Math.min(2, move[0]));
    move[1] = Math.max(0, Math.min(2, move[1]));
    const dir = (move[0] << 2) | move[1];
    send([PACKET.CLIENT.MOVE_UPDATE, dir + 1]);
};

keyboard.onSendChat = (message: string) =>
    send([PACKET.CLIENT.CHAT_MESSAGE, message]);

const mouse = new MouseInputListener();

let updateTick: number = 0;
mouse.onMouseMove = (mousePos: [number, number]) => {
    const player = world.objects.get(world.user || -1);
    if (player) {
        let mouseToWorld = viewport.toLocal({ x: mousePos[0], y: mousePos[1] });
        const rotation =
            lookToward(player.position, mouseToWorld) - radians(90);
        updateTick++;
        if (Math.abs(player.rotation - rotation) > 0.1 || updateTick > 5) {
            updateTick = 0;
            send([PACKET.CLIENT.ROTATE, round(degrees(rotation))]);
        }
        player.rotation = rotation;
        ui.minimap.setPlayerRotation(player.id, rotation);
    }
};

world.addEventListener("object_move", (object) => {
    ui.minimap.setPlayerPosition(
        object.id,
        object.position.x,
        object.position.y
    );
});

world.addEventListener("new_player", (player: Player) =>
    ui.minimap.addPlayer(
        player.id,
        player.name.text,
        random.hexColor(),
        player.position.x,
        player.position.y
    )
);

ui.craftingMenu.leftclick = (item: number) => {
    send([PACKET.CLIENT.CRAFT_ITEM, item]);
};

ui.inventory.leftclick = (item: number) =>
    send([PACKET.CLIENT.SELECT_ITEM, item]);
ui.inventory.rightclick = (item: number, shift: boolean) =>
    send([PACKET.CLIENT.DROP_ITEM, [item, shift]]);

app.stage.addChild(ui.container);

// send attack/block action when the user clicks on the viewport
viewport.addEventListener("pointerdown", (event) => {
    if (event.button === 2) {
        send([PACKET.CLIENT.ACTION, [PACKET.ACTION.BLOCK, false]]);
    }
    if (event.button === 0) {
        send([PACKET.CLIENT.ACTION, [PACKET.ACTION.ATTACK, false]]);
    }
    viewport;
});

viewport.addEventListener("pointerup", (event) => {
    if (event.button == 2) {
        send([PACKET.CLIENT.ACTION, [PACKET.ACTION.BLOCK, true]]);
    }
    if (event.button === 0) {
        send([PACKET.CLIENT.ACTION, [PACKET.ACTION.ATTACK, true]]);
    }
});

// request unknown object ids on interval
setInterval(() => {
    if (world.requestIds.size > 0) {
        send([PACKET.CLIENT.REQUEST_OBJECTS, Array.from(world.requestIds)]);
        world.requestIds.clear();
    }
}, 500);

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);
stats.dom.style.top = "";
stats.dom.style.left = "";
stats.dom.style.bottom = "50%";
stats.dom.style.right = "0px";

function tick() {
    stats.begin();
    const player = world.objects.get(world.user ?? -1);
    if (player) {
        world.tick();
        AnimationManagers.UI.update();
    }
    stats.end();
    requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// when the menu button is clicked, connect to the websocket and hide them menu.
document.querySelector("button")?.addEventListener("click", () => {
    const ws = new WebSocket("ws://localhost:7777");
    socket = ws;

    ui.minimap.clear();
    world.clear();

    socket.onmessage = async (ev) => {
        const data = await decodeFromBlob(ev.data);
        if (!validate(data, z.array(z.any()))) {
            return;
        }
        parser.unpackMany(data);
    };

    document
        .querySelectorAll(".menu")
        .forEach((item) => item.classList.add("hidden"));

    const nameInput = document.getElementById("name-input") as HTMLInputElement;
    const name = nameInput.value;

    socket.onopen = () => {
        send([PACKET.CLIENT.JOIN, [name || "unnamed", 0, 0]]);
    };

    socket.onclose = () => {
        document
            .querySelectorAll(".menu")
            .forEach((item) => item.classList.remove("hidden"));
    };
});
