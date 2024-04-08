import * as PIXI from "pixi.js";
import { clamp, lerp } from "../../lib/transforms";
import { animationManager } from "../animation/animation_manager";
import { Animation, AnimationManager } from "../../lib/animations";

class StatsDisplay {
    amount: number;
    container: PIXI.Container;
    decor: PIXI.Sprite;
    primaryBar: PIXI.Sprite;
    secondaryBar?: PIXI.Sprite;
    animations: Map<number, Animation>;

    constructor(decor: string, bar1: string, bar2?: string) {
        this.animations = new Map();
        this.animations.set(0, statsTransition(this));
        this.amount = 0;
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
            this.secondaryBar.tint = 0xaaaaaa;
            this.container.addChild(this.secondaryBar);
        }
        this.container.addChild(this.decor);
    }

    update(amount: number, manager: AnimationManager) {
        const animation = this.animations.get(0);
        this.amount = amount;
        if (animation) {
            manager.add(this, animation.run(true));
        }
    }
}

function statsTransition(target: StatsDisplay) {
    const animation = new Animation(0);
    let amount: number = 0;

    animation.keyframes[0] = (animation) => {
        if (animation.isFirstKeyframe) {
            amount = target.primaryBar.width;
            animation.goto(0, 200);
        }
        if (animation.keyframeEnded) {
            animation.goto(1, 400);
        }
    };

    animation.keyframes[1] = (animation) => {
        target.primaryBar.width = lerp(amount, target.amount, animation.t);

        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };

    return animation;
}
export const barContainer = new PIXI.Container();
const hungerContainer = new StatsDisplay(
    "./assets/hunger.svg",
    "./assets/hunger_bar.svg"
);
const heatContainer = new StatsDisplay(
    "./assets/heat.svg",
    "./assets/heat_bar.svg",
    "./assets/heat_bar.svg"
);
const healthContainer = new StatsDisplay(
    "./assets/health.svg",
    "./assets/damage_bar.svg",
    "./assets/health_bar.svg"
);
healthContainer.secondaryBar!.height = 400;
healthContainer.secondaryBar!.position.set(92, 0);
healthContainer.secondaryBar!.tint = 0xffffff;
healthContainer.primaryBar!.tint = 0xffffff;
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
        window.innerHeight - 280
    );
}
window.addEventListener("resize", resize);
resize();

let healthstat = 100;
let hungerstat = 100;
let heatstat = 200;
export function updateStatBars(health: number, hunger: number, heat: number) {
    health = clamp(health, 0, 100);
    hunger = clamp(hunger, 0, 100);
    heat = clamp(heat, 0, 200);
    health = health * 2.9;
    healthContainer.secondaryBar!.width = health;
    healthContainer.update(health, animationManager);
    hunger = hunger * 2.9;
    hungerContainer.update(hunger, animationManager);
    heat = heat * 2.9;
    if (heat > 290) {
        heatContainer.secondaryBar!.width = heat - 290;
        heatContainer.primaryBar.width = 290;
    } else {
        heatContainer.secondaryBar!.width = 0;
        heatContainer.primaryBar.width = heat;
    }
}
//  window.addEventListener("click", updatestats);
// window.addEventListener("contextmenu", updatestats2);
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
