import { degrees, lookToward } from "../lib/transforms";
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
import { rangeFromPoint } from "../lib/range";
import { encode } from "@msgpack/msgpack";
import { decodeFromBlob } from "./network/decode";

const { viewport } = createRenderer();
const packetPipeline = new PacketPipeline();
const socket = new WebSocket("ws://localhost:7777");
const world = new World(viewport, animationManager);

// viewport.addChild(debugContainer);
debugContainer.zIndex = 1000;
viewport.sortChildren();

createPipeline(packetPipeline, world);

export let requestIds: number[] = [];

packetPipeline.add(
    PACKET_TYPE.PING,
    new Unpacker((_: ServerPacketSchema.ping) => {}, ServerPacketSchema.ping)
);

socket.onopen = () => {
    console.log("CONNECTED");
    socket.send(encode([CLIENT_PACKET_TYPE.PING]));
};

socket.onmessage = async (ev) => {
    const data = await decodeFromBlob(ev.data);
    packetPipeline.unpack(data);
};

// tick updates

function tick() {
    world.tick();
    requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

function moveUpdate(move: [number, number]) {
    socket.send(encode([CLIENT_PACKET_TYPE.MOVE_UPDATE, ...move]));
}

let updateTick = 0;
function mouseMoveCallback(mousePos: [number, number]) {
    const player = world.dynamicObjs.get(world.user || -1);
    if (player) {
        let mouseToWorld = viewport.toWorld(mousePos[0], mousePos[1]);
        const rotation =
            lookToward(player.position, mouseToWorld) - degrees(90);
        updateTick++;
        if (Math.abs(player.rotation - rotation) > 0.2 || updateTick > 10) {
            updateTick = 0;
            socket.send(
                encode([CLIENT_PACKET_TYPE.ROTATE, round(rotation, 3)])
            );
        }
        player.rotation = rotation;
    }
}

viewport.on("pointerdown", (event) => {
    if (event.button == 2) {
        socket.send(
            encode([CLIENT_PACKET_TYPE.ACTION, CLIENT_ACTION.START_BLOCK])
        );
    } else {
        socket.send(
            encode([CLIENT_PACKET_TYPE.ACTION, CLIENT_ACTION.START_ATTACK])
        );
    }
});

viewport.on("pointerup", (event) => {
    if (event.button == 2) {
        socket.send(
            encode([CLIENT_PACKET_TYPE.ACTION, CLIENT_ACTION.STOP_BLOCK])
        );
    } else {
        socket.send(
            encode([CLIENT_PACKET_TYPE.ACTION, CLIENT_ACTION.STOP_ATTACK])
        );
    }
});

new InputHandler(moveUpdate, mouseMoveCallback);

// interactions

function hideOutOfSight() {
    const player = world.objects.get(world.user);
    if (player) {
        const range = rangeFromPoint(player.position, 8000);
        const query = world.objects.query(range);
        for (const object of world.objects.values()) {
            const queryObject = query.get(object.id);
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
