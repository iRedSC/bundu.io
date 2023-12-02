import * as PIXI from "pixi.js";
import { Viewport } from "pixi-viewport";
import {
    DAY_COLOR,
    EVENING_COLOR,
    MORNING_COLOR,
    NIGHT_COLOR,
    WORLD_SIZE,
} from "./constants";
import { AnimationManager, Keyframes } from "../lib/animation";
import { colorLerp } from "../lib/transforms";

const times = new Map();
times.set(0, MORNING_COLOR);
times.set(1, DAY_COLOR);
times.set(2, EVENING_COLOR);
times.set(3, NIGHT_COLOR);

export class Sky {
    graphics: PIXI.Graphics;
    currentCycle: number;
    animationManager: AnimationManager<Sky>;

    constructor(world: Viewport) {
        this.currentCycle = 0;
        this.graphics = new PIXI.Graphics();
        this.graphics.beginFill(0xffffff);
        this.graphics.lineStyle({ width: 5 });
        this.graphics.drawRect(0, 0, WORLD_SIZE, WORLD_SIZE);
        this.graphics.zIndex = 100;
        // this.graphics.alpha = 0.5;
        this.graphics.blendMode = PIXI.BLEND_MODES.MULTIPLY;
        world.addChild(this.graphics);

        this.animationManager = loadAnimations(this);
    }

    setNight() {
        this.graphics.tint = NIGHT_COLOR;
    }

    setEvening() {
        this.graphics.tint = EVENING_COLOR;
    }
    setMorning() {
        this.graphics.tint = MORNING_COLOR;
    }

    setDay() {
        this.graphics.tint = 0xffffff;
    }

    advanceCycle() {
        this.currentCycle = (this.currentCycle + 1) % 4;
        this.animationManager.start("transistion");
    }
}

function loadAnimations(target: Sky) {
    const transistionKeyframes: Keyframes<Sky> = new Keyframes();

    transistionKeyframes.frame(0).set = ({ target, animation }) => {
        if (animation.firstKeyframe) {
            animation.goto(0, 1000);
        }
        let lastCycle = target.currentCycle - 1;
        if (lastCycle === -1) {
            lastCycle = 3;
        }
        target.graphics.tint = colorLerp(
            times.get(lastCycle),
            times.get(target.currentCycle),
            animation.t
        );
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };

    const animationManager = new AnimationManager(target);
    animationManager.add("transistion", transistionKeyframes);
    return animationManager;
}
