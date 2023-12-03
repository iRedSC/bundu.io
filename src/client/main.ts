import { Player } from "./game_objects/player";
import { degrees, lookToward, moveToward } from "../lib/transforms";
import { move, mousePos, createClickEvents } from "./keyboard";
import { createStuff } from "./testing";
import { createRenderer } from "./rendering/rendering";
import { createSwitch } from "./toggle";
import { Sky } from "./game_objects/sky";

export const all_objects: any[] = [];
const structures: any[] = [];

const { viewport } = createRenderer();

createStuff(viewport, all_objects, structures);

const player: Player = new Player(0, [Date.now(), 0, 0, 0]);
let playerPos: { x: number; y: number } = { x: 20000, y: 20000 };
player.update(
    [Date.now(), 20000, 20000, 0],
    ["amethyst_sword", "amethyst_helmet", 0]
);
viewport.addChild(player.container);
all_objects.push(player);

viewport.follow(player.container, {
    speed: 0,
    acceleration: 1,
    radius: 5,
});

// tick updates

setInterval(() => {
    sky.animationManager.update();
    player.animationManager.update();
    player.move();
}, 10);

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
            85
        );
    }
    player.update([Date.now() + 50, playerPos.x, playerPos.y, rotation]);
}, 50);

// interactions

createClickEvents(player);

const sky = new Sky(viewport);
setInterval(() => {
    sky.advanceCycle();
}, 60000);

createSwitch(player);
