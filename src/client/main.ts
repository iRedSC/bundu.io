import * as PIXI from "pixi.js";
import { Player } from "./game_objects/player";
import { degrees, lookToward, moveToward } from "../lib/transforms";
import { createViewport } from "./viewport";
import { moveInputs } from "./keyboard";
import { Entity } from "./game_objects/entity";
import { createStuff } from "./testing";
import { Simple } from "pixi-cull";

const all_objects: { setNight: () => void; setDay: () => void }[] = [];

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

let cullDirty = true;

const viewportCenter = new PIXI.Point(0, 0);
const viewport = createViewport(app, viewportCenter);
app.stage.addChild(viewport);

const cull = new Simple();
cull.addList(viewport.children);
cull.cull(viewport.getVisibleBounds());
viewport.on("frame-end", () => {
    if (viewport.dirty || cullDirty) {
        console.log("culling");
        cull.cull(viewport.getVisibleBounds());

        viewport.dirty = false;
        cullDirty = false;
    }
});
createStuff(viewport, all_objects);

viewport.sortChildren();
document.body.appendChild(app.view);

const player: Player = new Player(0, [Date.now(), 0, 0, 0]);
player.update([Date.now(), 20000, 20000, 0], ["empty", "empty", 0]);
viewport.addChild(player.container);
all_objects.push(player);

let elePos = { x: 20000, y: 20000 };
const elephant = new Entity(0, "elephant");
elephant.update([Date.now(), 10000, 20000, 0]);
viewport.addChild(elephant.container);
all_objects.push(elephant);

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
    elephant.animationManager.update();
    viewportCenter.x = viewport.center.x;
    viewportCenter.y = viewport.center.y;
});

cullDirty = true;

setInterval(() => {
    // elephant.move();
    player.move();
}, 10);

window.onresize = (_) => {
    viewport.resize(window.innerWidth, window.innerHeight);
};

setInterval(() => {
    elePos = moveToward(elePos, lookToward(elePos, playerPos), 20);
    let mouseToWorld = viewport.toWorld(mousePos[0], mousePos[1]);
    const rotation =
        lookToward(player.container.position, mouseToWorld) - degrees(90);
    const dir = moveInputs();
    console.log(playerPos, mouseToWorld, mousePos, rotation);
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
    elephant.update([
        Date.now() + 50,
        elePos.x,
        elePos.y,
        lookToward(elePos, playerPos),
    ]);
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
    console.log("Switch toggled");
    if (switchCheckbox.checked) {
        console.log("Switch is ON");
        for (let obj of all_objects) {
            obj.setNight();
        }
    } else {
        console.log("Switch is OFF");
        for (let obj of all_objects) {
            obj.setDay();
        }
    }
});

console.log("this works");
