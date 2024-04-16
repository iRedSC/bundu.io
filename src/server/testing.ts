import Random from "../lib/random.js";
import { Physics } from "./components/base.js";
import { World } from "./game_engine/world.js";
import { Entity } from "./game_objects/entity.js";
import { Ground } from "./game_objects/ground.js";
import { Resource } from "./game_objects/resource.js";
import SAT from "sat";

// This file is filled with test objects

function getRandomPhysics(_size: number): Physics {
    const size = Random.integer(_size - 5, _size + 5);
    const position = new SAT.Vector(
        Random.integer(1500, 19500),
        Random.integer(1500, 19500)
    );
    return {
        position: position,
        collider: new SAT.Circle(position, size),
        size: size,
        rotation: Random.integer(0, Math.PI * 2),
        solid: true,
        speed: 0,
    };
}

export function createResources(world: World, amount: number) {
    for (let i = 0; i < amount; i++) {
        const structure = new Resource(getRandomPhysics(30), {
            id: Random.choice([
                114, 115, 116, 117, 118, 119, 103, 104, 105, 53, 54, 55, 56, 84,
                84, 90, 90, 90, 97, 97, 97,
            ]),
        });
        world.addObject(structure);
    }
}

export function createEntities(world: World, amount: number) {
    for (let i = 0; i < amount; i++) {
        const entity = new Entity(getRandomPhysics(30), {
            id: Random.integer(400, 402),
        });
        world.addObject(entity);
    }
}
