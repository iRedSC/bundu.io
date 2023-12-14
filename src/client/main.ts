import { PLAYER_ANIMATION, Player } from "./game_objects/player";
import { degrees, lookToward, moveToward } from "../lib/transforms";
import { move, mousePos } from "./input/keyboard";
import { createStuff } from "./testing";
import { createRenderer } from "./rendering/rendering";
import { Sky } from "./game_objects/sky";
import { AnimationManager } from "../lib/animation";
import { World } from "./game_objects/object_list";
import { Viewport } from "pixi-viewport";
import { PACKET, PACKET_TYPE } from "../shared/enums";
import { Unpacker } from "./game_objects/unpack";

const { viewport } = createRenderer();
const animationManager = new AnimationManager();
const unpacker = new Unpacker();
const world = new World(viewport, animationManager);

unpacker.add(PACKET_TYPE.MOVE_OBJECT, world.moveObject.bind(world));
unpacker.add(PACKET_TYPE.NEW_STRUCTURE, world.newStructure.bind(world));
unpacker.add(PACKET_TYPE.NEW_PLAYER, world.newPlayer.bind(world));

function createClickEvents(viewport: Viewport, player: Player) {
    document.body.addEventListener("mousemove", (event) => {
        mousePos[0] = event.clientX;
        mousePos[1] = event.clientY;
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

createStuff(world, unpacker);

const _player: PACKET.FULL.NEW_PLAYER = [
    PACKET_TYPE.NEW_PLAYER,
    0,
    [[1000, "test", 10_000, 10_000, 0, 0, 0, 0]],
];
unpacker.unpack(_player);
const player = world.dynamicObjs.get(1000)!;
console.log(player);

viewport.follow(player, {
    speed: 0,
    acceleration: 1,
    radius: 5,
});

let playerPos: { x: number; y: number } = { x: 10000, y: 10000 };
// tick updates

function tick() {
    world.tick();
    requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

const updateSpeed = 50;

setInterval(() => {
    let mouseToWorld = viewport.toWorld(mousePos[0], mousePos[1]);
    const rotation = lookToward(player.position, mouseToWorld) - degrees(90);
    if (!(move[0] === 0 && move[1] === 0)) {
        playerPos = moveToward(
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
    // const objectMoving = [];
    // for (let [id, object] of world.objects.entries()) {
    //     if (id === 1000) {
    //         continue;
    //     }
    //     const newRot = lookToward(object.position, playerPos);
    //     const newPos = moveToward(
    //         object.position,
    //         lookToward(object.position, playerPos),
    //         updateSpeed
    //     );
    //     objectMoving.push([id, newPos.x, newPos.y, newRot]);
    // }
    // unpacker.unpack([
    //     PACKET_TYPE.MOVE_OBJECT,
    //     Date.now() + updateSpeed,
    //     objectMoving as PACKET.MOVE_OBJECT[],
    // ]);
    viewport.dirty = true;
}, updateSpeed);

// interactions

createClickEvents(viewport, player as Player);

const sky = new Sky();
viewport.addChild(sky);
sky.advanceCycle(animationManager);
setInterval(() => {
    sky.advanceCycle(animationManager);
}, 6000);
