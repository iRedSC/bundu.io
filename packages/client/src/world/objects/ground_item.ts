import {
    clientRegistries,
    clientModelId,
} from "../../configs/registries";
import { lerp, radians, rotationLerp } from "@bundu/shared/transforms";
import type { Container, Point } from "pixi.js";
import { AnimationManagers } from "../../animation/animations";
import { Animation } from "../../animation/runtime";
import GameObject from "../game_object";
import { mountModel } from "../../models/mount";

/** Fitted world icon size (world units). */
export const GROUND_ITEM_SIZE = 54;
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
    private targetRotation = 0;

    constructor(id: number, itemId: number, position: Point, rotation: number) {
        super(id, position, radians(rotation), 12, 1);
        const name = clientModelId(clientRegistries().item.location(itemId));
        const mounted = mountModel(name, "world", this.container, {
            maxSize: GROUND_ITEM_SIZE,
            shadows: false,
            anchor: { x: 0.5, y: 0.5 },
        });
        const wiggleTarget = mounted?.sprites[0] ?? this.container;
        this.container.zIndex = 2;
        this.targetRotation = this.container.rotation;

        this.animations.set(WIGGLE, itemWiggle(wiggleTarget));
        this.trigger(WIGGLE, AnimationManagers.World);
    }

    get isTraveling(): boolean {
        return this.target !== undefined;
    }

    /** Remote drop: travel from thrower toward the land point. */
    popFrom(origin: Point, target: Point) {
        this.flyFrom(origin, target, 0.65, this.container.rotation);
    }

    /**
     * Travel from `origin` to `target`, lerping scale → 1 and rotation → end.
     * Used for local drops (cursor → land) and remote pops (player → land).
     */
    flyFrom(
        origin: Point,
        target: Point,
        startScale: number,
        endRotation: number,
        startRotation = 0
    ) {
        this.target = target;
        this.targetRotation = endRotation;
        this.positionStates.snap(origin);
        this.container.position.copyFrom(origin);
        this.container.scale.set(startScale);
        this.rotationStates.snap(startRotation);
        this.container.rotation = startRotation;
        this.renderable = true;
    }

    override update(): boolean {
        if (!this.target) return super.update();

        const position = this.container.position;
        position.x = lerp(position.x, this.target.x, POP_LERP);
        position.y = lerp(position.y, this.target.y, POP_LERP);
        const scale = lerp(this.container.scale.x, 1, POP_LERP);
        this.container.scale.set(scale);
        this.container.rotation = rotationLerp(
            this.container.rotation,
            this.targetRotation,
            POP_LERP
        );

        const x = position.x - this.target.x;
        const y = position.y - this.target.y;
        const rotDelta = Math.abs(
            ((this.container.rotation - this.targetRotation + Math.PI) %
                (Math.PI * 2)) -
                Math.PI
        );
        if (x * x + y * y > 4 || Math.abs(scale - 1) > 0.02 || rotDelta > 0.05) {
            return false;
        }

        this.positionStates.snap(this.target);
        this.container.position.copyFrom(this.target);
        this.container.scale.set(1);
        this.rotationStates.snap(this.targetRotation);
        this.container.rotation = this.targetRotation;
        this.target = undefined;
        return true;
    }

    override dispose(): void {
        AnimationManagers.World.remove(this);
        super.dispose();
    }
}
