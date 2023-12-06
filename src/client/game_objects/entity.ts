import * as PIXI from "pixi.js";
import { colorLerp, degrees, lerp, rotationLerp } from "../../lib/transforms";
import { AnimationManager, AnimationMap, Keyframes } from "../../lib/animation";
import { Random } from "../../lib/random";

type State = [time: number, x: number, y: number, rotation: number];
function typeofState(state?: State): state is State {
    if (!state) {
        return false;
    }
    return (
        typeof state[0] === "number" &&
        typeof state[1] === "number" &&
        typeof state[2] === "number" &&
        typeof state[3] === "number"
    );
}

type EntityParts = {
    container: PIXI.Container;
    body: PIXI.Sprite;
};

export class Entity {
    id: number;
    lastState: State;
    nextState: State;
    pos: PIXI.Point;
    rotation: number;
    size: number;
    parts: EntityParts;
    animations: AnimationMap<EntityParts>;
    animationManager: AnimationManager;
    constructor(animationManager: AnimationManager, id: number, type: string) {
        this.animationManager = animationManager;

        this.id = id;

        this.pos = new PIXI.Point(0, 0);
        this.rotation = 0;
        this.size = 5;

        this.parts = {
            container: new PIXI.Container(),
            body: PIXI.Sprite.from(`./assets/${type}.svg`, {
                mipmap: PIXI.MIPMAP_MODES.ON,
            }),
        };
        this.parts.container.pivot.set(
            this.parts.container.width / 2,
            this.parts.container.height / 2
        );
        this.parts.container.position.set(this.pos.x, this.pos.y);
        this.parts.body = PIXI.Sprite.from(`./assets/${type}.svg`, {
            mipmap: PIXI.MIPMAP_MODES.ON,
        });
        this.parts.body.rotation = degrees(-90);
        this.parts.body.anchor.set(0.5);
        this.parts.container.addChild(this.parts.body);
        this.parts.body.scale.set(this.size);
        this.animations = loadAnimations(this.parts);
        this.trigger("idle");
        this.lastState = [Date.now(), 0, 0, 0];
        this.nextState = [Date.now(), 0, 0, 0];
        this.move();
    }
    trigger(name: string) {
        const animation = this.animations.get(name);
        if (animation) {
            this.animationManager.add(this, animation.run());
        }
    }
    move() {
        const now = Date.now();
        const t =
            (now - this.lastState[0]) / (this.nextState[0] - this.lastState[0]);
        this.pos.x = lerp(this.lastState[1], this.nextState[1], t);
        this.pos.y = lerp(this.lastState[2], this.nextState[2], t);
        this.rotation = rotationLerp(this.lastState[3], this.nextState[3], t);
        this.container.position = this.pos;
        this.container.rotation = this.rotation;
    }
    update(state: State) {
        if (typeofState(state)) {
            this.lastState = this.nextState;
            this.nextState = state;
            if (this.nextState[0] < this.lastState[0]) {
                this.nextState[0] = this.lastState[0];
            }
        }
    }
    get container() {
        return this.parts.container;
    }
}

function loadAnimations(target: EntityParts) {
    const idleKeyframes: Keyframes<EntityParts> = new Keyframes();
    idleKeyframes.frame(0).set = ({ target, animation }) => {
        animation.meta.width = target.container.scale.x;
        animation.meta.height = target.container.scale.y;
        animation.meta.frameLength = Random.integer(2000, 4000);

        animation.next(animation.meta.frameLength);
    };

    idleKeyframes.frame(1).set = ({ target, animation }) => {
        target.container.scale.x =
            animation.meta.width + Math.cos(animation.t * Math.PI * 2) * 0.02;
        target.container.scale.y =
            animation.meta.height - Math.cos(animation.t * Math.PI * 2) * 0.03;
        if (animation.keyframeEnded) {
            animation.goto(1, animation.meta.frameLength);
        }
    };

    const hurtKeyframes: Keyframes<EntityParts> = new Keyframes();
    hurtKeyframes.frame(0).set = ({ animation }) => {
        if (animation.firstKeyframe) {
            animation.goto(0, 100);
        }
        target.body.tint = colorLerp(0xffffff, 0xff0000, animation.t);
        if (animation.keyframeEnded) {
            animation.next(400);
        }
    };
    hurtKeyframes.frame(1).set = ({ target, animation }) => {
        target.body.tint = colorLerp(0xff0000, 0xffffff, animation.t);
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };

    const animationMap = new AnimationMap(target);

    animationMap.set("idle", idleKeyframes);
    animationMap.set("hurt", hurtKeyframes);
    return animationMap;
}
