import * as PIXI from "pixi.js";
import {
    clamp,
    colorLerp,
    degrees,
    lerp,
    rotationLerp,
} from "../../../lib/transforms";
import { AnimationManager, Keyframes } from "../../../lib/animation";
import { randomInt } from "../../../lib/math";

interface PreviousData {
    time: number;
    pos: PIXI.Point;
    rotation: number;
}

interface EntityParts {
    container: PIXI.Container;
    body: PIXI.Sprite;
}

export class Entity {
    time: number;

    states: PreviousData[];

    pos: PIXI.Point;
    rotation: number;
    size: number;

    parts: EntityParts;

    animationManager: AnimationManager<EntityParts>;

    constructor(
        time: number,
        pos: PIXI.Point,
        rotation: number,
        size: number,
        sprite: string
    ) {
        this.time = time;

        this.pos = pos;
        this.size = size;

        this.rotation = rotation;

        this.parts = {
            container: new PIXI.Container(),
            body: PIXI.Sprite.from(`./assets/${sprite}.svg`, {
                mipmap: PIXI.MIPMAP_MODES.ON,
            }),
        };

        this.parts.container.pivot.set(
            this.parts.container.width / 2,
            this.parts.container.height / 2
        );
        this.parts.container.position.set(this.pos.x, this.pos.y);

        this.parts.body = PIXI.Sprite.from(`./assets/${sprite}.svg`, {
            mipmap: PIXI.MIPMAP_MODES.ON,
        });
        this.parts.body.rotation = degrees(-90);
        this.parts.body.anchor.set(0.5);

        this.parts.container.addChild(this.parts.body);
        this.parts.body.scale.set(size);
        this.states = [];
        this.states.push({
            time: this.time,
            pos: this.pos,
            rotation: this.rotation,
        });

        this.animationManager = loadAnimations(this.parts);

        this.addAnimation("idle");
    }

    setState(time: number) {
        while (time > this.states[0].time && this.states.length > 2) {
            this.states.splice(0, 1);
        }
        const lastState = this.states[0];
        const nextState = this.states[1] || this.states[0];
        const difference =
            (time - lastState.time) / (nextState.time - lastState.time);
        const t = clamp(difference, 0, 1);
        this.parts.container.x = lerp(lastState.pos.x, nextState.pos.x, t);
        this.parts.container.y = lerp(lastState.pos.y, nextState.pos.y, t);

        this.parts.container.rotation = rotationLerp(
            lastState.rotation,
            nextState.rotation,
            t
        );
    }

    addAnimation(name: string) {
        this.animationManager.start(name);
    }

    update(time: number, data: unknown[]) {
        if (!checkData(data)) {
            return;
        }
        const pos = data[0];
        const rotation = data[1];

        this.states.push({
            time: this.time,
            pos: structuredClone(this.pos),
            rotation: this.rotation,
        });
        this.time = time;
        this.pos = new PIXI.Point(pos[0], pos[1]);
        this.rotation = rotation;
        this.states.push({
            time: this.time,
            pos: structuredClone(this.pos),
            rotation: this.rotation,
        });
    }

    get container() {
        return this.parts.container;
    }
}

function checkData(data: any[]): data is [[number, number], number] {
    try {
        const pos = data[0];
        const rotation = data[1];
        if (
            typeof pos[0] === "number" &&
            typeof pos[1] === "number" &&
            typeof rotation === "number"
        ) {
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

function loadAnimations(target: EntityParts) {
    const idleKeyframes: Keyframes<EntityParts> = new Map();
    idleKeyframes.set(0, ({ target, animation }) => {
        animation.meta.width = target.container.scale.x;
        animation.meta.height = target.container.scale.y;
        animation.meta.frameLength = randomInt(2000, 4000);

        animation.next(animation.meta.frameLength);
    });
    idleKeyframes.set(1, ({ target, animation }) => {
        target.container.scale.x =
            animation.meta.width + Math.cos(animation.t * Math.PI * 2) * 0.02;
        target.container.scale.y =
            animation.meta.height - Math.cos(animation.t * Math.PI * 2) * 0.03;
        if (animation.keyframeEnded) {
            animation.goto(1, animation.meta.frameLength);
        }
    });

    const hurtKeyframes: Keyframes<EntityParts> = new Map();
    hurtKeyframes.set(0, ({ animation }) => {
        if (animation.firstKeyframe) {
            animation.goto(0, 100);
        }
        target.body.tint = colorLerp(0xffffff, 0xff0000, animation.t);
        if (animation.keyframeEnded) {
            animation.next(400);
        }
    });
    hurtKeyframes.set(1, ({ target, animation }) => {
        target.body.tint = colorLerp(0xff0000, 0xffffff, animation.t);
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    });

    const animationManager = new AnimationManager(target);

    animationManager.add("idle", idleKeyframes);
    animationManager.add("hurt", hurtKeyframes);
    return animationManager;
}
