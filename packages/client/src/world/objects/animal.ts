import { getStringId } from "@bundu/shared/id_map";
import { colorLerp, lerp, rotationLerp } from "@bundu/shared/transforms";
import type { Point } from "pixi.js";
import { Container } from "pixi.js";
import {
    SpriteFactory,
    type ContaineredSprite,
} from "@client/assets/sprite_factory";
import { ANIMATION, AnimationManagers } from "../../animation/animations";
import { Animation } from "../../animation/runtime";
import { animalVisual } from "@client/configs/animals";
import GameObject from "../game_object";
import type { PositionState } from "../states";

function idle(body: Container, bob: number): Animation {
    const animation = new Animation();
    animation.keyframes[0] = (active) => {
        if (active.isFirstKeyframe) active.goto(0, 1_200);
        const wave = Math.sin(active.t * Math.PI * 2);
        body.position.y = wave * bob * 0.35;
        body.scale.set(1 + wave * 0.025, 1 - wave * 0.025);
        if (active.keyframeEnded) active.goto(0, 1_200);
    };
    animation.cleanup = () => {
        body.position.y = 0;
        body.scale.set(1);
    };
    return animation;
}

function hurt(sprite: ContaineredSprite): Animation {
    const animation = new Animation();
    let tint = 0xffffff;
    animation.keyframes[0] = (active) => {
        if (active.isFirstKeyframe) {
            tint = Number(sprite.sprite.tint);
            active.goto(0, 100);
        }
        sprite.sprite.tint = colorLerp(tint, 0xff0000, active.t);
        if (active.keyframeEnded) active.next(250);
    };
    animation.keyframes[1] = (active) => {
        sprite.sprite.tint = colorLerp(0xff0000, tint, active.t);
        if (active.keyframeEnded) active.expired = true;
    };
    animation.cleanup = () => {
        sprite.sprite.tint = tint;
    };
    return animation;
}

function attack(root: Container): Animation {
    const animation = new Animation();
    animation.keyframes[0] = (active) => {
        if (active.isFirstKeyframe) active.goto(0, 100);
        root.position.x = lerp(0, 18, active.t);
        if (active.keyframeEnded) active.next(150);
    };
    animation.keyframes[1] = (active) => {
        root.position.x = lerp(18, 0, active.t);
        if (active.keyframeEnded) active.expired = true;
    };
    animation.cleanup = () => {
        root.position.x = 0;
    };
    return animation;
}

/** A server-authoritative actor whose facing and idle motion are purely visual. */
export class Animal extends GameObject {
    private readonly visual = new Container();
    private readonly body = new Container();
    private readonly bob: number;
    private lastTarget = { x: 0, y: 0 };
    private facing = 0;
    private targetFacing = 0;
    private lastVisualAt = performance.now();

    constructor(id: number, typeId: number, position: Point, collisionRadius: number) {
        super(id, position, 0, collisionRadius, 1, 250);
        const type = getStringId(typeId);
        const config = animalVisual(type);
        this.bob = config.bob;
        const sprite = SpriteFactory.build(type);
        sprite.anchor.set(0.5);
        sprite.width = config.scale;
        sprite.height = config.scale;
        this.body.addChild(sprite);
        this.visual.addChild(this.body);
        this.visual.rotation = -Math.PI / 2;
        this.container.addChild(this.visual);
        this.container.zIndex = 5;
        this.lastTarget = { x: position.x, y: position.y };
        this.animations.set("animal_idle", idle(this.body, this.bob));
        this.animations.set(ANIMATION.HURT, hurt(sprite));
        this.animations.set(ANIMATION.ATTACK, attack(this.visual));
        this.trigger("animal_idle", AnimationManagers.World);
    }

    override addPosition(position: PositionState): void {
        const dx = position.x - this.lastTarget.x;
        const dy = position.y - this.lastTarget.y;
        if (Math.hypot(dx, dy) > 0.05) {
            this.targetFacing = Math.atan2(dy, dx);
        }
        this.lastTarget = position;
        super.addPosition(position);
    }

    override update(now = performance.now()): boolean {
        const done = super.update(now);
        const elapsed = Math.min(now - this.lastVisualAt, 20);
        this.facing = rotationLerp(
            this.facing,
            this.targetFacing,
            Math.min(1, elapsed / 120)
        );
        this.container.rotation = this.facing;
        this.lastVisualAt = now;
        return done;
    }
}
