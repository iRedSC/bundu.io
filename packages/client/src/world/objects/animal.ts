import { getStringId } from "@bundu/shared/id_map";
import { attackFacingRadians } from "@bundu/shared";
import { TILE_SIZE } from "@bundu/shared/tiles";
import { rotationLerp } from "@bundu/shared/transforms";
import type { Point } from "pixi.js";
import { AnimationManagers } from "../../animation/animations";
import { assemble } from "../../visual/assemble";
import { bindAnimations } from "../../visual/bind";
import { animalDef } from "../../visual/defs";
import type { ObjectDef } from "../../visual/types";
import GameObject from "../game_object";
import type { PositionState } from "../states";
import { clientTime } from "@client/globals";

function angleDelta(from: number, to: number): number {
    let delta = to - from;
    delta = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    else if (delta < -Math.PI) delta += 2 * Math.PI;
    return delta;
}

/** A server-authoritative actor whose facing and idle motion are purely visual. */
export class Animal extends GameObject {
    private readonly typeId: string;
    private lastTarget = { x: 0, y: 0 };
    private facing = 0;
    private targetFacing = 0;
    private lastVisualAt = clientTime.now();

    constructor(
        id: number,
        typeId: number,
        position: Point,
        collisionRadius: number,
        scale = 1
    ) {
        super(id, position, 0, collisionRadius, TILE_SIZE * (scale ?? 1), 250);
        this.typeId = getStringId(typeId);
        this.applyVisualDefinition(animalDef(this.typeId));
        this.container.zIndex = 5;
        this.lastTarget = { x: position.x, y: position.y };
    }

    private applyVisualDefinition(def: ObjectDef) {
        const assembled = assemble(def, this.container);
        const { animations, autoplay } = bindAnimations(def, assembled.parts);
        for (const [animId, animation] of animations) {
            this.animations.set(animId, animation);
        }
        for (const animId of autoplay) {
            this.trigger(animId, AnimationManagers.World);
        }
    }

    reloadVisualDefinition() {
        AnimationManagers.World.remove(this);
        for (const child of this.container.removeChildren()) {
            child.destroy({ children: true });
        }
        this.animations.clear();
        this.applyVisualDefinition(animalDef(this.typeId));
    }

    /** Turn toward a world-space direction (radians, 0 = east) — lerps in update. */
    face(direction: number) {
        this.targetFacing = direction;
    }

    /**
     * Server attack/look sync uses the player convention (0° = up).
     * Convert to movement-facing space so the sprite aims correctly.
     */
    override addRotation(rotation: number): void {
        this.face(attackFacingRadians(rotation));
    }

    override addPosition(position: PositionState, now?: number): void {
        const dx = position.x - this.lastTarget.x;
        const dy = position.y - this.lastTarget.y;
        if (Math.hypot(dx, dy) > 0.05) {
            this.targetFacing = Math.atan2(dy, dx);
        }
        this.lastTarget = position;
        super.addPosition(position, now);
    }

    override update(now = clientTime.now()): boolean {
        const done = super.update(now);
        const elapsed = Math.min(now - this.lastVisualAt, 20);
        this.facing = rotationLerp(
            this.facing,
            this.targetFacing,
            Math.min(1, elapsed / 120)
        );
        this.container.rotation = this.facing;
        this.lastVisualAt = now;
        const turning = Math.abs(angleDelta(this.facing, this.targetFacing)) > 0.02;
        return done && !turning;
    }

    override dispose(): void {
        AnimationManagers.World.remove(this);
        super.dispose();
    }
}
