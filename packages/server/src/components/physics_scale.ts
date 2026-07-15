import type { AttributesData } from "./attributes.js";
import type { Physics } from "./base.js";

/**
 * Seed `physics.scale` and keep collision radius = baseRadius × scale.
 * `baseRadius` defaults to the physics radius at bind time
 * (animal: TILE_SIZE/2 so scale 1 fills one tile; player: hitbox).
 */
export function bindPhysicsScale(
    attributes: AttributesData,
    physics: Physics,
    scale = 1,
    baseRadius = physics.collisionRadius
) {
    attributes.set("physics.scale", "base", "add", scale);
    const apply = (value: number) => {
        physics.collisionRadius = baseRadius * value;
        physics.collider.r = physics.collisionRadius;
    };
    attributes.addEventListener("physics.scale", apply);
    apply(attributes.get("physics.scale"));
}
