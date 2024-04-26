import SAT from "sat";
import { GroundData, Physics, Type } from "./components/base.js";
import { World } from "./game_engine/world.js";
import { Ground } from "./game_objects/ground.js";
import { Resource } from "./game_objects/resource.js";
import { idMap } from "./configs/loaders/id_map.js";
import { MapConfig, loadMap } from "./configs/loaders/load_map.js";
import { radians } from "../lib/transforms.js";

export function createResource(
    id: string,
    variant: number,
    position: SAT.Vector,
    size: number,
    rotation: number
) {
    const physics: Physics = {
        position,
        size,
        rotation: rotation + radians(-45),
        collider: new SAT.Circle(position, size),
        solid: true,
        speed: 0,
    };
    const numericId = idMap.get(id);
    if (numericId === undefined) return;
    const type: Type = { id: numericId, variant: variant };
    if (!type.variant) delete type.variant;
    return new Resource(physics, type);
}

const GROUND_MAP: Record<string, number> = {
    ground_forest: 1,
    ground_winter: 2,
    ground_savannah: 3,
    ground_sand: 4,
} as const;

export function createMap(world: World) {
    const mapData = loadMap();
    for (const groundData of mapData.ground) {
        const type = GROUND_MAP[groundData.id];
        if (type === undefined) continue;
        const collider = new SAT.Box(
            new SAT.Vector(groundData.x, groundData.y),
            groundData.width,
            groundData.height
        );
        const ground = new Ground({
            collider,
            type,
            speedMultiplier: 1,
        });
        world.addObject(ground);
    }
    for (const objectData of mapData.objects) {
        switch (objectData.class) {
            case "resource":
                const resource = createResource(
                    objectData.id,
                    objectData.variant ?? 0,
                    new SAT.Vector(objectData.x, objectData.y),
                    objectData.size,
                    objectData.rotation
                );
                if (!resource) continue;
                world.addObject(resource);
        }
    }
}
