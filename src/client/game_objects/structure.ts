import * as PIXI from "pixi.js";
import { degrees, lerp, lookToward, moveToward } from "../../lib/transforms";
import { AnimationManager, Keyframes } from "../../lib/animation";

// type StructureData = [id: number, pos: number, size: number, rotation: number];

type StructureParts = {
    container: PIXI.Container;
    sprite: PIXI.Sprite;
};

export class Structure {
    id: number;
    pos: PIXI.Point;
    size: number;
    rotation: number;
    animationManager: AnimationManager<Structure>;
    parts: StructureParts;
    lastHitSource: PIXI.Point;

    constructor(
        id: number,
        pos: [x: number, y: number],
        size: number,
        rotation: number,
        type: string
    ) {
        this.lastHitSource = new PIXI.Point(0, 0);
        this.id = id;

        this.pos = new PIXI.Point(pos[0], pos[1]);

        this.rotation = rotation;
        this.size = size;

        this.parts = {
            container: new PIXI.Container(),
            sprite: PIXI.Sprite.from(`./assets/${type}.svg`, {
                mipmap: PIXI.MIPMAP_MODES.ON,
            }),
        };
        this.parts.container.zIndex = 10;
        this.parts.container.pivot.set(
            this.parts.container.width / 2,
            this.parts.container.height / 2
        );
        this.parts.container.position.set(this.pos.x, this.pos.y);
        this.parts.sprite = PIXI.Sprite.from(`./assets/${type}.svg`, {
            mipmap: PIXI.MIPMAP_MODES.ON,
        });
        this.parts.sprite.rotation = rotation - degrees(-90);
        this.parts.sprite.anchor.set(0.5);
        this.parts.container.addChild(this.parts.sprite);
        this.parts.sprite.scale.set(this.size);

        this.animationManager = loadAnimations(this);
    }

    trigger(name: string) {
        this.animationManager.start(name);
    }

    update() {}
}

function loadAnimations(target: Structure) {
    const hitKeyframes: Keyframes<Structure> = new Keyframes();
    hitKeyframes.frame(0).set = ({ target, animation }) => {
        if (animation.firstKeyframe) {
            animation.goto(0, 100);
        }
        const targetPos = moveToward(
            target.pos,
            lookToward(target.lastHitSource, target.pos),
            50
        );
        target.parts.container.x = lerp(target.pos.x, targetPos.x, animation.t);
        target.parts.container.y = lerp(target.pos.y, targetPos.y, animation.t);
        if (animation.keyframeEnded) {
            animation.next(400);
        }
    };
    hitKeyframes.frame(1).set = ({ target, animation }) => {
        target.parts.container.x = lerp(
            target.parts.container.x,
            target.pos.x,
            animation.t
        );
        target.parts.container.y = lerp(
            target.parts.container.y,
            target.pos.y,
            animation.t
        );
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };

    const animationManager = new AnimationManager(target);

    animationManager.add("hit", hitKeyframes);
    return animationManager;
}
