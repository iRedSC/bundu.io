import {
    clientRegistries,
    clientVisualId,
} from "../../configs/registries";
import { lerp, radians } from "@bundu/shared/transforms";
import type { Container, Point } from "pixi.js";
import { SpriteFactory } from "@client/assets/sprite_factory";
import { AnimationManagers } from "../../animation/animations";
import { Animation } from "../../animation/runtime";
import GameObject from "../game_object";
import { lookupContextVisual } from "../../visual/defs";

const ITEM_SIZE = 54;
const POP_LERP = 0.16;
const WIGGLE = "wiggle";
const WIGGLE_TILT = radians(10);
const WIGGLE_MS = 2_400;

/** Slow looping tilt on the item sprite (container keeps drop facing). */
function itemWiggle(sprite: Container) {
    const animation = new Animation();
    animation.keyframes[0] = (a) => {
        if (a.isFirstKeyframe) a.goto(0, WIGGLE_MS);
        sprite.rotation = Math.sin(a.t * Math.PI * 2) * WIGGLE_TILT;
        if (a.keyframeEnded) a.goto(0, WIGGLE_MS);
    };
    animation.cleanup = () => {
        sprite.rotation = 0;
    };
    return animation;
}

/** A rendered item stack. Drops briefly travel from their thrower to the ground. */
export class GroundItem extends GameObject {
    private target?: Point;

    constructor(id: number, itemId: number, position: Point, rotation: number) {
        super(id, position, radians(rotation), 12, 1);
        const name = clientVisualId(clientRegistries().item.location(itemId));
        const texture = lookupContextVisual(name)?.contexts.world?.texture;
        const sprite = SpriteFactory.build(texture ?? "bundu/misc/unknown_asset.svg");
        sprite.width = ITEM_SIZE;
        sprite.height = ITEM_SIZE;
        sprite.anchor.set(0.5);
        this.container.addChild(sprite);
        this.container.zIndex = 2;

        this.animations.set(WIGGLE, itemWiggle(sprite));
        this.trigger(WIGGLE, AnimationManagers.World);
    }

    popFrom(origin: Point, target: Point) {
        this.positionStates.snap(origin);
        this.container.position.copyFrom(origin);
        this.target = target;
        this.container.scale.set(0.65);
    }

    override update(): boolean {
        if (!this.target) return super.update();

        const position = this.container.position;
        position.x = lerp(position.x, this.target.x, POP_LERP);
        position.y = lerp(position.y, this.target.y, POP_LERP);
        const scale = lerp(this.container.scale.x, 1, POP_LERP);
        this.container.scale.set(scale);
        const x = position.x - this.target.x;
        const y = position.y - this.target.y;
        if (x * x + y * y > 4) return false;

        this.positionStates.snap(this.target);
        this.container.position.copyFrom(this.target);
        this.container.scale.set(1);
        this.target = undefined;
        return true;
    }

    override dispose(): void {
        AnimationManagers.World.remove(this);
        super.dispose();
    }
}
