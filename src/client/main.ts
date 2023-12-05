import { Player } from "./game_objects/player";
import { degrees, lookToward, moveToward } from "../lib/transforms";
import { move, mousePos, createClickEvents } from "./input/keyboard";
import { createStuff } from "./testing";
import { createRenderer } from "./rendering/rendering";
import { Sky } from "./game_objects/sky";
import { BunduClient } from "./client";

const { viewport } = createRenderer();

const client = new BunduClient(viewport);

createStuff(client);

const player: Player = new Player(0, "test", Date.now(), [0, 0], 0);
let playerPos: { x: number; y: number } = { x: 20000, y: 20000 };
player.update([Date.now(), 20000, 20000, 0], ["", "", 0]);
viewport.addChild(player.container);

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

createClickEvents(viewport, player);

const sky = new Sky(viewport);
setInterval(() => {
    sky.advanceCycle();
}, 60000);
