import Random from "../lib/random.js";
import { Physics } from "./components/base.js";
import { World } from "./game_engine/world.js";
import { Entity } from "./game_objects/entity.js";
import { Ground } from "./game_objects/ground.js";
import { Resource } from "./game_objects/resource.js";
import SAT from "sat";

// This file is filled with test objects

function getRandomPhysics(): Physics {
    const size = Random.integer(15, 45);
    const position = new SAT.Vector(
        Random.integer(1500, 19500),
        Random.integer(1500, 19500)
    );
    return {
        position: position,
        collider: new SAT.Circle(position, size),
        size: size,
        rotation: 0,
        solid: true,
        speed: 0,
    };
}

export function createResources(world: World, amount: number) {
    for (let i = 0; i < amount; i++) {
        const structure = new Resource(getRandomPhysics(), {
            id: Random.integer(1, 100),
        });
        world.addObject(structure);
    }
}

export function createEntities(world: World, amount: number) {
    for (let i = 0; i < amount; i++) {
        const entity = new Entity(getRandomPhysics(), {
            id: Random.integer(400, 402),
        });
        world.addObject(entity);
    }
}

// export function createGround(world: World) {
//     const ground1 = new Ground(
//         new SAT.Vector(1500, 1500),
//         new SAT.Vector(19500, 19500),
//         0
//     );
//     const ground2 = new Ground(
//         new SAT.Vector(15000, 1500),
//         new SAT.Vector(19500, 15000),
//         1
//     );

//     world.ground.push(ground1, ground2);
// }
