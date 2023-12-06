import * as PIXI from "pixi.js";
import { Viewport } from "pixi-viewport";
import {
    DAY_COLOR,
    EVENING_COLOR,
    MORNING_COLOR,
    NIGHT_COLOR,
    WORLD_SIZE,
} from "../constants";
import { AnimationManager, AnimationMap, Keyframes } from "../../lib/animation";
import { colorLerp } from "../../lib/transforms";

const times = new Map();
times.set(0, MORNING_COLOR);
times.set(1, DAY_COLOR);
times.set(2, EVENING_COLOR);
times.set(3, NIGHT_COLOR);

export class Sky {
    graphics: PIXI.Graphics;
    currentCycle: number;
    animations: AnimationMap<Sky>;

    constructor(world: Viewport) {
        this.currentCycle = 0;
        this.graphics = new PIXI.Graphics();
        this.graphics.beginFill(0xffffff);
        this.graphics.lineStyle({ width: 5 });
        this.graphics.drawRect(0, 0, WORLD_SIZE, WORLD_SIZE);
        this.graphics.zIndex = 100;
        this.graphics.blendMode = PIXI.BLEND_MODES.MULTIPLY;
        world.addChild(this.graphics);

        this.animations = loadAnimations(this);
    }

    advanceCycle(animationManager: AnimationManager) {
        this.currentCycle = (this.currentCycle + 1) % 4;
        const animation = this.animations.get("transistion");
        if (animation !== undefined) {
            animationManager.add(this, animation.run());
        }
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

    const animationMap = new AnimationMap(target);
    animationMap.set("transistion", transistionKeyframes);
    return animationMap;
}
