import { Graphics } from "pixi.js";
import {
    DAY_COLOR,
    EVENING_COLOR,
    MORNING_COLOR,
    NIGHT_COLOR,
    WORLD_SIZE,
} from "../constants";
import { colorLerp } from "@bundu/shared/transforms";
import { Animation, type AnimationManager } from "../animation/runtime";
import { shadowOffsetForPeriod, shadowStyle } from "../models/shadow";

const PERIOD_COLORS = [
    MORNING_COLOR,
    DAY_COLOR,
    EVENING_COLOR,
    NIGHT_COLOR,
] as const;

const SKY_TRANSITION = "sky_transition";

/** Day/night multiply overlay driven by authoritative SetTimeOfDay packets. */
export class Sky extends Graphics {
    currentCycle = 0;
    nextCycle = 0;
    private readonly transition = skyTransition(this);

    constructor() {
        super();
        this.rect(0, 0, WORLD_SIZE, WORLD_SIZE).fill(0xffffff);
        this.zIndex = 200;
        this.blendMode = "multiply";
        this.tint = PERIOD_COLORS[0];
        const initial = shadowOffsetForPeriod(0);
        shadowStyle.offsetX = initial.x;
        shadowStyle.offsetY = initial.y;
    }

    setTime(period: number, manager: AnimationManager) {
        if (period < 0 || period >= PERIOD_COLORS.length) return;
        if (period === this.nextCycle) return;
        this.nextCycle = period;
        manager.set(this, SKY_TRANSITION, this.transition.run(), true);
    }
}

function skyTransition(target: Sky) {
    const animation = new Animation();

    animation.keyframes[0] = (active) => {
        if (active.isFirstKeyframe) {
            active.goto(0, 1000);
        }
        const t = active.t;
        target.tint = colorLerp(
            PERIOD_COLORS[target.currentCycle] ?? DAY_COLOR,
            PERIOD_COLORS[target.nextCycle] ?? DAY_COLOR,
            t
        );
        const from = shadowOffsetForPeriod(target.currentCycle);
        const to = shadowOffsetForPeriod(target.nextCycle);
        shadowStyle.offsetX = from.x + (to.x - from.x) * t;
        shadowStyle.offsetY = from.y + (to.y - from.y) * t;
        if (active.keyframeEnded) {
            target.currentCycle = target.nextCycle;
            const settled = shadowOffsetForPeriod(target.currentCycle);
            shadowStyle.offsetX = settled.x;
            shadowStyle.offsetY = settled.y;
            active.expired = true;
        }
    };

    return animation;
}
