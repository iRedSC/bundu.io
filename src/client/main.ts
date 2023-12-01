import * as PIXI from "pixi.js";
import { Player } from "./game_objects/player";
import { degrees, lookToward, moveToward } from "../lib/transforms";
import { createViewport } from "./viewport";
import { moveInputs } from "./keyboard";
import { createStuff } from "./testing";
import { Simple } from "pixi-cull";

const all_objects: { setNight: () => void; setDay: () => void }[] = [];
const structures: any[] = [];

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

const cull = new Simple();
cull.addList(viewport.children);
cull.cull(viewport.getVisibleBounds());
viewport.on("frame-end", () => {
    if (viewport.dirty) {
        cull.cull(viewport.getVisibleBounds());

        viewport.dirty = false;
    }
});
createStuff(viewport, all_objects, structures);

viewport.sortChildren();
document.body.appendChild(app.view);

const player: Player = new Player(0, [Date.now(), 0, 0, 0]);
player.update([Date.now(), 20000, 20000, 0], ["diamond_sword", "empty", 0]);
viewport.addChild(player.container);
all_objects.push(player);

viewport.follow(player.container, {
    speed: 0,
    acceleration: 1,
    radius: 5,
});

viewport.moveCenter(player.pos.x, player.pos.y);

// tick updates
let playerPos: { x: number; y: number } = { x: 20000, y: 20000 };

app.ticker.add(() => {
    player.animationManager.update();
    for (let obj of structures) {
        obj.animationManager.update();
    }
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
    const rotation =
        lookToward(player.container.position, mouseToWorld) - degrees(90);
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

const switchCheckbox =
    document.querySelector<HTMLInputElement>("label.switch input")!;

("label.switch input");
switchCheckbox.addEventListener("click", function () {
    if (switchCheckbox.checked) {
        for (let obj of all_objects) {
            obj.setNight();
        }
    } else {
        for (let obj of all_objects) {
            obj.setDay();
        }
    }
});

console.log("this works");
