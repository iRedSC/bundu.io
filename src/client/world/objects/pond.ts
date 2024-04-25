import { WorldObject } from "./world_object";
import { cubicBezier } from "../../animation/animations";
import { Point } from "pixi.js";
import { Animation, AnimationManager } from "../../../lib/animations";
import { lerp } from "../../../lib/transforms";
import { SpriteFactory, SpriteWrapper } from "../../assets/sprite_factory";

function createSprite(
    color: number,
    pos: Point,
    size: number,
    z: number,
    a?: number
) {
    const sprite = SpriteFactory.build("circle");
    sprite.position = pos;
    sprite.zIndex = z;
    sprite.alpha = a === undefined ? 1 : a;
    sprite.scale.set(size / 5000);
    sprite.tint = color;
    sprite.anchor.set(0.5);
    return sprite;
}

export class Pond extends WorldObject {
    sprites: [
        SpriteWrapper,
        SpriteWrapper,
        SpriteWrapper,
        SpriteWrapper,
        SpriteWrapper,
        SpriteWrapper
    ];

    constructor(
        id: number,
        pos: Point,
        size: number,
        manager: AnimationManager
    ) {
        super(id, pos, 0, size);

        this.sprites = [
            createSprite(0x6d614e, pos, size + 60, -8),
            createSprite(0x564c3c, pos, size + 30, -7),
            createSprite(0x699dba, pos, size, -6),
            createSprite(0x5a8eab, pos, Math.max(size - 30, 0), -5),
            createSprite(0x4d809d, pos, Math.max(size - 60, 0), -4),
            createSprite(0x467691, pos, Math.max(size - 170, 0), -3),
        ];

        this.container.zIndex = 10;
        this.container.pivot.set(
            this.container.width / 2,
            this.container.height / 2
        );

        manager.add(this, 0, wave(this.sprites[5], 8500).run());
        manager.add(this, 0, wave(this.sprites[4], 4300).run());
        manager.add(this, 0, wave(this.sprites[3], 6200).run());
        manager.add(this, 0, wave(this.sprites[2], 8100).run());
    }

    get containers() {
        return this.sprites;
    }
}

export function wave(target: SpriteWrapper, time: number) {
    const timingFunction = cubicBezier(0.68, 0.3, 0.32, 0.74);
    const size = target.scale.x;
    const animation = new Animation();
    animation.keyframes[0] = (animation) => {
        animation.next(time);
    };
    animation.keyframes[1] = (animation) => {
        const t = timingFunction(animation.t);
        target.scale.set(lerp(size * 0.95, size * 1.05, t));
        if (animation.keyframeEnded) {
            animation.next(time);
        }
    };
    animation.keyframes[2] = (animation) => {
        const t = timingFunction(animation.t);
        target.scale.set(lerp(size * 1.05, size * 0.95, t));
        if (animation.keyframeEnded) {
            animation.previous(time);
        }
    };
    animation.keyframes[-1] = () => {
        target.scale.set(size);
    };
    return animation;
}
