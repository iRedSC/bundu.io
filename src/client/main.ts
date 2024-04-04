import { radians, lookToward, degrees } from "../lib/transforms";
import { InputHandler } from "./input/keyboard";
import { createRenderer } from "./rendering/rendering";
import { World } from "./game_objects/world";
import {
    CLIENT_ACTION,
    CLIENT_PACKET_TYPE,
    PACKET_TYPE,
    ServerPacketSchema,
} from "../shared/enums";
import { PacketPipeline, Unpacker } from "../shared/unpack";
import { animationManager } from "./animation_manager";
import { createPipeline } from "./packet_pipline";
import { debugContainer } from "./debug";
import { round } from "../lib/math";
import { encode } from "@msgpack/msgpack";
import { decodeFromBlob } from "./network/decode";
import { BasicPoint } from "../lib/types";
import { Graphics } from "pixi.js";

const { viewport } = createRenderer();
const packetPipeline = new PacketPipeline();
const socket = new WebSocket("ws://localhost:7777");
const world = new World(viewport, animationManager);

viewport.addChild(debugContainer);
debugContainer.zIndex = 1000;
viewport.sortChildren();

createPipeline(packetPipeline, world);

export let requestIds: number[] = [];

packetPipeline.add(
    PACKET_TYPE.PING,
    new Unpacker((_: ServerPacketSchema.ping) => {}, ServerPacketSchema.ping)
);

function drawPolygon(packet: ServerPacketSchema.drawPolygon) {
    console.log("Drawing poly");
    const polygon = new Graphics();
    polygon.lineStyle({ width: 20, color: "#FF0000" });
    const start = { x: packet[0] * 10, y: packet[1] * 10 };
    polygon.moveTo(start.x, start.y);
    for (const rawPoint of packet[2]) {
        const point = {
            x: start.x + rawPoint[0] * 10,
            y: start.y + rawPoint[1] * 10,
        };
        polygon.lineTo(point.x, point.y);
    }
    debugContainer.addChild(polygon);
    setTimeout(() => {
        debugContainer.removeChild(polygon);
        polygon.destroy();
    }, 1000);
}

packetPipeline.add(
    PACKET_TYPE.DRAW_POLYGON,
    new Unpacker(drawPolygon, ServerPacketSchema.drawPolygon)
);

socket.onopen = () => {
    console.log("CONNECTED");
    socket.send(encode([CLIENT_PACKET_TYPE.JOIN, ["test", 0, 0, 0]]));
};

socket.onmessage = async (ev) => {
    const data = await decodeFromBlob(ev.data);
    // console.log(data);
    packetPipeline.unpack(data);
};

// tick updates

function tick() {
    world.tick();
    requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

function moveUpdate(move: [number, number]) {
    move[0] = Math.max(0, Math.min(2, move[0]));
    move[1] = Math.max(0, Math.min(2, move[1]));
    const dir = (move[0] << 2) | move[1];
    console.log(dir);
    socket.send(encode([CLIENT_PACKET_TYPE.MOVE_UPDATE, dir + 1]));
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
            socket.send(
                encode([CLIENT_PACKET_TYPE.ROTATE, round(degrees(rotation))])
            );
        }
        player.rotation = rotation;
    }
}

viewport.on("pointerdown", (event) => {
    if (event.button == 2) {
        socket.send(
            encode([CLIENT_PACKET_TYPE.ACTION, [CLIENT_ACTION.BLOCK, false]])
        );
    } else {
        socket.send(
            encode([CLIENT_PACKET_TYPE.ACTION, [CLIENT_ACTION.ATTACK, false]])
        );
    }
});

viewport.on("pointerup", (event) => {
    if (event.button == 2) {
        socket.send(
            encode([CLIENT_PACKET_TYPE.ACTION, [CLIENT_ACTION.BLOCK, true]])
        );
    } else {
        socket.send(
            encode([CLIENT_PACKET_TYPE.ACTION, [CLIENT_ACTION.ATTACK, true]])
        );
    }
});

new InputHandler(moveUpdate, mouseMoveCallback);

// interactions

function hideOutOfSight() {
    if (!world.user) {
        return;
    }
    const player = world.objects.get(world.user);
    if (player) {
        const range: [BasicPoint, BasicPoint] = [
            { x: player.position.x - 16000, y: player.position.y - 9000 },
            { x: player.position.x + 16000, y: player.position.y + 9000 },
        ];
        const query = world.quadtree.query(range);
        for (const object of world.objects.values()) {
            const queryObject = query.has(object.id);
            if (queryObject) {
                continue;
            }
            object.renderable = false;
        }
    }
}

setInterval(() => {
    if (requestIds.length > 0) {
        socket.send(encode([CLIENT_PACKET_TYPE.REQUEST_OBJECT, requestIds]));
        requestIds = [];
    }
}, 500);

setInterval(hideOutOfSight, 2000);
