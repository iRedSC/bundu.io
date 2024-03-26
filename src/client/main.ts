import { degrees, lookToward } from "../lib/transforms";
import { InputHandler } from "./input/keyboard";
import { createRenderer } from "./rendering/rendering";
import { World } from "./game_objects/world";
import { CLIENT_PACKET_TYPE, PACKET_TYPE, Schemas } from "../shared/enums";
import { PacketPipeline, Unpacker } from "../shared/unpack";
import { animationManager } from "./animation_manager";
import { createPipeline } from "./packet_pipline";
import { debugContainer } from "./debug";
import { round } from "../lib/math";

const { viewport } = createRenderer();
const packetPipeline = new PacketPipeline();
const world = new World(viewport, animationManager);

viewport.addChild(debugContainer);
debugContainer.zIndex = 1000;
viewport.sortChildren();

createPipeline(packetPipeline, world);

packetPipeline.add(
    PACKET_TYPE.PING,
    new Unpacker(
        (packet: Schemas.ping) => {
            console.log(packet[0]);
        },
        1,
        Schemas.ping
    )
);

const socket = new WebSocket("ws://localhost:7777");

socket.onopen = () => {
    console.log("CONNECTED");
    socket.send(JSON.stringify([CLIENT_PACKET_TYPE.PING]));
};

socket.onmessage = (ev) => {
    // console.log(ev.data);
    packetPipeline.unpack(JSON.parse(ev.data));
};

// tick updates

function tick() {
    world.tick();
    requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

function moveUpdate(move: [number, number]) {
    console.log(move);
    socket.send(JSON.stringify([CLIENT_PACKET_TYPE.MOVE_UPDATE, ...move]));
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
                JSON.stringify([CLIENT_PACKET_TYPE.ROTATE, round(rotation, 3)])
            );
        }
        player.rotation = rotation;
    }
}

const inputHandler = new InputHandler(moveUpdate, mouseMoveCallback);

// interactions
