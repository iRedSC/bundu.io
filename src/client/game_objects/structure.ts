import * as PIXI from "pixi.js";
import { degrees, lerp, lookToward, moveToward } from "../../lib/transforms";
import { AnimationManager, AnimationMap, Keyframes } from "../../lib/animation";

// type StructureData = [id: number, pos: number, size: number, rotation: number];

type StructureParts = {
    container: PIXI.Container;
    sprite: PIXI.Sprite;
};

function createParts(
    type: string,
    pos: [number, number],
    rotation: number,
    size: number
): StructureParts {
    const parts = {
        container: new PIXI.Container(),
        sprite: PIXI.Sprite.from(`./assets/${type}.svg`, {
            mipmap: PIXI.MIPMAP_MODES.ON,
        }),
    };
    parts.container.zIndex = 10;
    parts.container.pivot.set(
        parts.container.width / 2,
        parts.container.height / 2
    );
    parts.container.position.set(pos[0], pos[1]);
    parts.sprite = PIXI.Sprite.from(`./assets/${type}.svg`, {
        mipmap: PIXI.MIPMAP_MODES.ON,
    });
    parts.sprite.rotation = rotation - degrees(-90);
    parts.sprite.anchor.set(0.5);
    parts.container.addChild(parts.sprite);
    parts.sprite.scale.set(size);

    return parts;
}

export class Structure {
    pos: PIXI.Point;
    size: number;
    rotation: number;
    animationManager: AnimationManager;
    animations: AnimationMap<Structure>;
    parts: StructureParts;
    lastHitSource: PIXI.Point;

    constructor(
        animationManager: AnimationManager,
        type: string,
        pos: [x: number, y: number],
        rotation: number,
        size: number
    ) {
        this.lastHitSource = new PIXI.Point(0, 0);

        this.pos = new PIXI.Point(pos[0], pos[1]);

        this.parts = createParts(type, pos, rotation, size);

        this.rotation = rotation;
        this.size = size;

        this.animations = loadAnimations(this);
        this.animationManager = animationManager;
    }

    get container() {
        return this.parts.container;
    }

    trigger(name: string) {
        const animation = this.animations.get(name);
        if (animation) {
            this.animationManager.add(this, animation.run());
        }
    }
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

    const animationMap = new AnimationMap(target);

    animationMap.set("hit", hitKeyframes);
    return animationMap;
}
