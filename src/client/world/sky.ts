import * as PIXI from "pixi.js";
import {
    DAY_COLOR,
    EVENING_COLOR,
    MORNING_COLOR,
    NIGHT_COLOR,
    WORLD_SIZE,
} from "../constants";
import { colorLerp } from "../../lib/transforms";
import { Animation, AnimationManager } from "../../lib/animations";

const times = new Map();
times.set(0, MORNING_COLOR);
times.set(1, DAY_COLOR);
times.set(2, EVENING_COLOR);
times.set(3, NIGHT_COLOR);

enum SKY_ANIMATION {
    TRANSISTION = 0,
}

export class Sky extends PIXI.Graphics {
    currentCycle: number;
    nextCycle: number;
    animations: Map<number, Animation>;

    constructor() {
        super();
        this.currentCycle = 0;
        this.nextCycle = 0;
        this.beginFill(0xffffff);
        this.drawRect(0, 0, WORLD_SIZE, WORLD_SIZE);
        this.zIndex = 100;
        this.blendMode = PIXI.BLEND_MODES.MULTIPLY;

        this.animations = new Map();
        this.animations.set(SKY_ANIMATION.TRANSISTION, skyTransition(this));
    }

    setTime(time: number, manager: AnimationManager) {
        this.nextCycle = time;
        const animation = this.animations.get(SKY_ANIMATION.TRANSISTION);
        if (animation !== undefined) {
            manager.add(this, 0, animation.run());
        }
    }
}

function skyTransition(target: Sky) {
    const animation = new Animation();

    animation.keyframes[0] = (animation) => {
        if (animation.isFirstKeyframe) {
            animation.goto(0, 1000);
        }
        target.tint = colorLerp(
            times.get(target.currentCycle),
            times.get(target.nextCycle),
            animation.t
        );
        if (animation.keyframeEnded) {
            target.currentCycle = target.nextCycle;
            animation.expired = true;
        }
    };

    return animation;
}
