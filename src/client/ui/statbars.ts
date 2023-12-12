import * as PIXI from "pixi.js";
import { AnimationMap, Keyframes } from "../../lib/animation";

class StatsDisplay {
    container: PIXI.Container;
    decor: PIXI.Sprite;
    primaryBar: PIXI.Sprite;
    secondaryBar?: PIXI.Sprite;

    constructor(decor: string, bar1: string, bar2?: string) {
        this.container = new PIXI.Container();
        this.container.scale.set(0.6);
        this.container.position.set(270, 0);
        this.decor = PIXI.Sprite.from(decor);

        this.primaryBar = PIXI.Sprite.from(bar1);
        this.primaryBar.width = 290;
        this.primaryBar.position.set(92, 0);



        this.container.addChild(this.primaryBar);
        if (bar2) {
            this.secondaryBar = PIXI.Sprite.from(bar2);
            this.secondaryBar.width = 290;
            this.secondaryBar.position.set(92, 100);
            this.secondaryBar.height = 200;
            this.secondaryBar.tint = 0x7b0700;
            this.container.addChild(this.secondaryBar);
        }
        this.container.addChild(this.decor);
    }
}

const transition: Keyframes<PIXI.Sprite> = new Keyframes();
transition.frame(0).set = ({ target, animation }) => {
    if (animation.firstKeyframe) {
        animation.goto(0, 400);
    }
};
export const barContainer = new PIXI.Container();
const hungerContainer = new StatsDisplay(
    "./assets/hunger.svg",
    "./assets/hunger_bar.svg",

);
const heatContainer = new StatsDisplay(
    "./assets/heat.svg",
    "./assets/heat_bar.svg",
    "./assets/heat_bar.svg",
);
const healthContainer = new StatsDisplay(
    "./assets/health.svg",
    "./assets/heat_bar.svg",
    "./assets/health_bar.svg",
);
healthContainer.secondaryBar!.height = 400;
healthContainer.secondaryBar!.position.set(92, 0);
healthContainer.secondaryBar!.tint = 0xffffff;
healthContainer.primaryBar!.tint = 0x7b0700;
healthContainer.container.position.set(-270, 0);
heatContainer.container.position.set(270, 0);
hungerContainer.container.position.set(0, 0);
barContainer.addChild(
    healthContainer.container,
    heatContainer.container,
    hungerContainer.container
);

function resize() {
    barContainer.position.set(
        (window.innerWidth - barContainer.width) / 2 + 270,
        window.innerHeight - 250
    );
}
window.addEventListener("resize", resize);
resize();

let healthstat = 100;
let hungerstat = 100;
let heatstat = 200;
export function updateStatBars(health: number, hunger: number, heat: number) {
    health = health * 2.9;
    healthContainer.secondaryBar!.width = health;
    console.log(health);
    hunger = hunger * 2.9;
    hungerContainer.primaryBar.width = hunger;
    heat = heat * 2.9;
    if (heat > 290) {
        heatContainer.secondaryBar!.width = heat - 290;
        heatContainer.primaryBar.width = 290;
    } else {
        heatContainer.secondaryBar!.width = 0;
        heatContainer.primaryBar.width = heat;
    }
}
window.addEventListener("click", updatestats);
window.addEventListener("contextmenu", updatestats2);
updateStatBars(healthstat, hungerstat, heatstat);

function updatestats() {
    healthstat -= 20;
    hungerstat -= 10;
    heatstat -= 20;
    updateStatBars(healthstat, hungerstat, heatstat);
}
function updatestats2() {
    healthstat += 20;
    hungerstat += 10;
    heatstat += 20;
    updateStatBars(healthstat, hungerstat, heatstat);
}
