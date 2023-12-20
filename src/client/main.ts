import { PLAYER_ANIMATION, Player } from "./game_objects/player";
import { degrees, lookToward, moveInDirection } from "../lib/transforms";
import { move, mousePos } from "./input/keyboard";
import { createRenderer } from "./rendering/rendering";
import { World } from "./game_objects/world";
import { Viewport } from "pixi-viewport";
import { PACKET_TYPE } from "../shared/enums";
import { Unpacker } from "./game_objects/unpack";
import { animationManager } from "./animation_manager";

const { viewport } = createRenderer();
const unpacker = new Unpacker();
const world = new World(viewport, animationManager);

const exampleSocket = new WebSocket("ws://localhost:7777");

exampleSocket.onopen = () => {
    console.log("CONNECTED");
};

exampleSocket.onmessage = (ev) => {
    console.log(ev.data);
    unpacker.unpack(JSON.parse(ev.data));
};

unpacker.add(PACKET_TYPE.MOVE_OBJECT, world.moveObject.bind(world));
unpacker.add(PACKET_TYPE.NEW_STRUCTURE, world.newStructure.bind(world));
unpacker.add(PACKET_TYPE.NEW_PLAYER, world.newPlayer.bind(world));
unpacker.add(PACKET_TYPE.SET_TIME, world.setTime.bind(world));

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

const _player = [
    PACKET_TYPE.NEW_PLAYER,
    0,
    [[1000, "test", 10_000, 10_000, 0, 0, 0, 0]],
];
unpacker.unpack(_player);
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
    unpacker.unpack([
        PACKET_TYPE.MOVE_OBJECT,
        Date.now() + updateSpeed,
        [[1000, playerPos.x, playerPos.y, rotation]],
    ]);
    viewport.dirty = true;
}, updateSpeed);

// interactions

createClickEvents(viewport, player as Player);
