import { Player } from "./game_objects/player";
import { degrees, lookToward, moveToward } from "../lib/transforms";
import { move, mousePos, createClickEvents } from "./input/keyboard";
import { createStuff } from "./testing";
import { createRenderer } from "./rendering/rendering";
import { Sky } from "./game_objects/sky";
import { BunduClient } from "./client";
import { AnimationManager } from "../lib/animation";
import { GameObjectHolder } from "./game_objects/object_list";
import { WORLD_SIZE } from "./constants";

const { viewport } = createRenderer();
const animationManager = new AnimationManager();
const objectHandler = new GameObjectHolder(animationManager);

viewport.worldHeight = WORLD_SIZE * 5;
viewport.worldWidth = WORLD_SIZE * 5;

const client = new BunduClient(viewport, objectHandler);

createStuff(client);

const player: Player = new Player(animationManager, "test", { x: 0, y: 0 }, 0);
let playerPos: { x: number; y: number } = { x: 10000, y: 10000 };
player.setState([Date.now(), 10000, 10000, 0], ["", "", 0]);
viewport.addChild(player.container);

viewport.follow(player.container, {
    speed: 0,
    acceleration: 1,
    radius: 5,
});
// tick updates

function tick() {
    objectHandler.tick();
    player.move();
    requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

const updateSpeed = 50;

setInterval(() => {
    let mouseToWorld = viewport.toWorld(mousePos[0], mousePos[1]);
    const rotation =
        lookToward(player.container.position, mouseToWorld) - degrees(90);
    if (!(move[0] === 0 && move[1] === 0)) {
        playerPos = moveToward(
            playerPos,
            lookToward(playerPos, {
                x: playerPos.x - move[0] * 10,
                y: playerPos.y - move[1] * 10,
            }),
            updateSpeed * 10
        );
    }
    player.setState([
        Date.now() + updateSpeed,
        playerPos.x,
        playerPos.y,
        rotation,
    ]);
    for (let entity of objectHandler.entities.values()) {
        const newRot = lookToward(entity.pos, playerPos);
        const newPos = moveToward(
            entity.pos,
            lookToward(entity.pos, playerPos),
            updateSpeed
        );
        entity.setState([Date.now() + updateSpeed, newPos.x, newPos.y, newRot]);
    }
    viewport.dirty = true;
}, updateSpeed);

// interactions

createClickEvents(viewport, player);

const sky = new Sky(viewport);
sky.advanceCycle(animationManager);
setInterval(() => {
    sky.advanceCycle(animationManager);
}, 60000);
