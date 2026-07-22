import { tileCenterWorld, TILE_SIZE } from "@bundu/shared/tiles";
import type { RegistryId } from "@bundu/shared/registry";
import { Circle, Vector } from "sat";
import { AnimalConfigs } from "../configs/loaders/animals.js";
import type { GameObject, World } from "../engine";
import { topGroundAt } from "../systems/ground_at.js";
import { tileBlockedFor } from "../systems/animal_pathing.js";
import { Animal } from "./animal.js";

/** Place an animal if top ground allows and the tile is clear; returns it or null. */
export function tryAddAnimal(
    world: World,
    id: RegistryId<"entity_type">,
    tx: number,
    ty: number,
    variant = "base"
): GameObject | null {
    const config = AnimalConfigs.get(id);
    const allowed = config.spawn.ground;
    if (allowed.length === 0) return null;

    const top = topGroundAt(world, tx, ty);
    if (top === undefined || !allowed.includes(top.type)) return null;

    const radius = (TILE_SIZE / 2) * config.scale;
    if (tileBlockedFor(world, { x: tx, y: ty }, radius)) return null;

    const position = new Vector(tileCenterWorld(tx), tileCenterWorld(ty));
    const object = new Animal(
        { id, variant },
        {
            position,
            collider: new Circle(position, radius),
            collisionRadius: radius,
            rotation: 0,
            speed: 0,
        }
    );
    world.addObject(object);
    return object;
}
