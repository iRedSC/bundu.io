import {
    clientRegistries,
    clientModelId,
} from "../../configs/registries";
import { attackFacingRadians } from "@bundu/shared";
import { TILE_SIZE } from "@bundu/shared/tiles";
import { rotationLerp } from "@bundu/shared/transforms";
import type { Point } from "pixi.js";
import { AnimationManagers } from "../../animation/animations";
import { assemble } from "../../models/assemble";
import { bindAnimations } from "../../models/bind";
import { animalDef } from "../../models/defs";
import type { ObjectDef } from "../../models/types";
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
    readonly modelId: string;
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
        // Match server animal cadence (4 TPS). No coast — idle gaps used to
        // overshoot then rubber-band when the next wander packet arrived.
        super(id, position, 0, collisionRadius, TILE_SIZE * (scale ?? 1), 250, 0);
        this.modelId = clientModelId(
            clientRegistries().entity_type.location(typeId)
        );
        this.applyModelDefinition(animalDef(this.modelId));
        this.container.zIndex = 5;
        this.lastTarget = { x: position.x, y: position.y };
    }

    private applyModelDefinition(def: ObjectDef) {
        const assembled = assemble(def, this.container);
        const { animations, autoplay } = bindAnimations(def, assembled.parts);
        for (const [animId, animation] of animations) {
            this.animations.set(animId, animation);
        }
        for (const animId of autoplay) {
            this.trigger(animId, AnimationManagers.World);
        }
    }

    reloadModelDefinition() {
        AnimationManagers.World.remove(this);
        for (const child of this.container.removeChildren()) {
            child.destroy({ children: true });
        }
        this.animations.clear();
        this.applyModelDefinition(animalDef(this.modelId));
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
