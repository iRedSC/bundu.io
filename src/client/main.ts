import { PLAYER_ANIMATION, Player } from "./game_objects/player";
import { degrees, lookToward, moveInDirection } from "../lib/transforms";
import { move, mousePos } from "./input/keyboard";
import { createRenderer } from "./rendering/rendering";
import { World } from "./game_objects/world";
import { Viewport } from "pixi-viewport";
import { PACKET_TYPE, Schemas } from "../shared/enums";
import { PacketPipeline } from "./game_objects/unpack";
import { animationManager } from "./animation_manager";
import { createPipeline } from "./packet_pipline";

const { viewport } = createRenderer();
const packetPipline = new PacketPipeline();
const world = new World(viewport, animationManager);

createPipeline(packetPipline, world);

const socket = new WebSocket("ws://localhost:7777");

socket.onopen = () => {
    console.log("CONNECTED");
};

socket.onmessage = (ev) => {
    console.log(ev.data);
    packetPipline.unpack(JSON.parse(ev.data));
};

function createClickEvents(viewport: Viewport, player: Player) {
    document.body.addEventListener("mousemove", (event) => {
        mousePos[0] = event.clientX;
        mousePos[1] = event.clientY;
    });

    document.body.addEventListener("touchmove", (event) => {
        mousePos[0] = event.touches[0].clientX;
        mousePos[1] = event.touches[0].clientY;
    });

    viewport.on("pointerdown", (event) => {
        if (event.button == 2) {
            player.blocking = true;
            player.trigger(PLAYER_ANIMATION.BLOCK, animationManager);
        } else {
            player.trigger(PLAYER_ANIMATION.ATTACK, animationManager);
        }
    });

    viewport.on("pointerup", (event) => {
        if (event.button == 2) {
            player.blocking = false;
        }
    });
}

// const client = new BunduClient(viewport, world);

const _player: [number, ...Schemas.newPlayer] = [
    PACKET_TYPE.NEW_PLAYER,
    1000,
    10_000,
    10_000,
    0,
    "test",
    0,
    0,
    0,
    0,
];

packetPipline.unpack(_player);
const player = world.dynamicObjs.get(1000)!;

viewport.follow(player, {
    speed: 0,
    acceleration: 1,
    radius: 0,
});

let playerPos: { x: number; y: number } = { x: 10000, y: 10000 };
// tick updates

function tick() {
    world.tick();
    let mouseToWorld = viewport.toWorld(mousePos[0], mousePos[1]);
    const rotation = lookToward(player.position, mouseToWorld) - degrees(90);
    player.rotation = rotation;
    requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

const updateSpeed = 100;

setInterval(() => {
    let mouseToWorld = viewport.toWorld(mousePos[0], mousePos[1]);
    const rotation = lookToward(player.position, mouseToWorld) - degrees(90);
    if (!(move[0] === 0 && move[1] === 0)) {
        playerPos = moveInDirection(
            playerPos,
            lookToward(playerPos, {
                x: playerPos.x - move[0] * 10,
                y: playerPos.y - move[1] * 10,
            }),
            updateSpeed * 2
        );
    }
    packetPipline.unpack([
        PACKET_TYPE.MOVE_OBJECT,
        1000,
        Date.now() + updateSpeed,
        playerPos.x,
        playerPos.y,
        rotation,
    ]);
    viewport.dirty = true;
}, updateSpeed);

// interactions

createClickEvents(viewport, player as Player);
