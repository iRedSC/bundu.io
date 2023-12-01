import * as PIXI from "pixi.js";
import { Player } from "./game_objects/player";
import { degrees, lookToward, moveToward } from "../lib/transforms";
import { createViewport } from "./viewport";
import { WORLD_SIZE } from "./constants";
import { moveInputs } from "./keyboard";
import { loadGround } from "./ground";
import { randomHexColor, randomInt } from "../lib/math";
import { Structure } from "./game_objects/structure";

const app = new PIXI.Application<HTMLCanvasElement>({
    resizeTo: window,
    backgroundColor: 0x0d5b73,
});

declare module globalThis {
    var __PIXI_APP__: PIXI.Application;
}

globalThis.__PIXI_APP__ = app;

// function fromWorldCenter(x: number, y: number) {
//     return new PIXI.Point(WORLD_SIZE / 2 - x, WORLD_SIZE / 2 - y);
// }

const viewportCenter = new PIXI.Point(0, 0);
const viewport = createViewport(app, viewportCenter);
app.stage.addChild(viewport);

loadGround(
    viewport,
    [
        [0, 0],
        [viewport.worldWidth, viewport.worldHeight],
    ],
    0x16a0ca
);

loadGround(
    viewport,
    [
        [5000, 5000],
        [viewport.worldWidth - 5000, viewport.worldHeight - 5000],
    ],
    0x1b6430
);

for (let i = 0; i < 50; i++) {
    loadGround(
        viewport,
        [
            [randomInt(0, 40000), randomInt(0, 40000)],
            [randomInt(0, 40000), randomInt(0, 40000)],
        ],
        randomHexColor()
    );
}

for (let i = 0; i < 50; i++) {
    const structure = new Structure(
        i,
        [randomInt(0, 40000), randomInt(0, 40000)],
        randomInt(3, 5),
        randomInt(0, Math.PI * 360),
        "stone"
    );
    viewport.addChild(structure.parts.container);
}

for (let i = 0; i < 50; i++) {
    const structure = new Structure(
        i,
        [randomInt(0, 40000), randomInt(0, 40000)],
        randomInt(5, 10),
        randomInt(0, Math.PI * 360),
        "tree"
    );
    viewport.addChild(structure.parts.container);
}

viewport.sortChildren();

document.body.appendChild(app.view);

const player: Player = new Player(0, [Date.now(), 0, 0, 0]);
player.update([Date.now(), 5000, 5000, 0]);

// viewport.follow(player.container);
viewport.follow(player.container, {
    speed: 0,
    acceleration: 1,
    radius: 5,
});

viewport.addChild(player.container);

viewport.moveCenter(player.pos.x, player.pos.y);

// tick updates
let playerPos: { x: number; y: number } = { x: 5000, y: 5000 };

app.ticker.add(() => {
    player.animationManager.update();
    viewportCenter.x = viewport.center.x;
    viewportCenter.y = viewport.center.y;
});

setInterval(() => {
    player.move();
}, 10);

window.onresize = (_) => {
    viewport.resize(window.innerWidth, window.innerHeight);
};

setInterval(() => {
    let mouseToWorld = viewport.toWorld(mousePos[0], mousePos[1]);
    const rotation = lookToward(playerPos, mouseToWorld) - degrees(90);
    const dir = moveInputs();
    if (!(dir[0] === 0 && dir[1] === 0)) {
        playerPos = moveToward(
            playerPos,
            lookToward(playerPos, {
                x: playerPos.x - dir[0] * 10,
                y: playerPos.y - dir[1] * 10,
            }),
            100
        );
    }
    player.update([Date.now() + 50, playerPos.x, playerPos.y, rotation]);
}, 50);

// interactions

let mousePos: [number, number] = [0, 0];

document.body.addEventListener("mousemove", (e) => {
    mousePos[0] = e.clientX;
    mousePos[1] = e.clientY;
});

let attack = false;
let clicked = false;
export let block = false;

setInterval(() => {
    if ((attack || clicked) && !block) {
        player.trigger("attack");
        clicked = false;
    }
}, 100);

setInterval(() => {
    if (block) {
        player.trigger("block");
    }
}, 100);

document.body.addEventListener("mousedown", (event) => {
    if (event.button == 2) {
        block = true;
    } else {
        attack = true;
    }
});

document.body.addEventListener("click", (event) => {
    if (event.button == 0) {
        clicked = true;
    }
});

document.body.addEventListener("mouseup", (event) => {
    if (event.button == 2) {
        block = false;
    } else {
        attack = false;
    }
});
