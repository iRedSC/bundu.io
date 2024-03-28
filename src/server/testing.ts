import Random from "../lib/random.js";
import { Entity } from "./game_objects/entity.js";
import { Ground } from "./game_objects/ground.js";
import { Resource } from "./game_objects/resource.js";
import { World } from "./world.js";
import SAT from "sat";

// This file is filled with test objects

export function createResources(world: World, amount: number) {
    for (let i = 0; i < amount; i++) {
        const structure = new Resource(
            world.nextId,
            [Random.integer(1500, 19500), Random.integer(1500, 19500)],
            Random.integer(0, Math.PI * 360),
            Random.integer(200, 205),
            Random.integer(1, 5)
        );

        world.nextId++;
        world.resources.insert(structure);
    }
}

export function createEntities(world: World, amount: number) {
    for (let i = 0; i < amount; i++) {
        const pos: [number, number] = [
            Random.integer(1500, 19500),
            Random.integer(1500, 19500),
        ];
        const entity = new Entity(
            world.nextId,
            Random.integer(400, 402),
            pos,
            0
        );
        world.entities.insert(entity);
        world.nextId++;
    }
}

export function createGround(world: World) {
    const ground1 = new Ground(
        new SAT.Vector(1500, 1500),
        new SAT.Vector(19500, 19500),
        0
    );
    const ground2 = new Ground(
        new SAT.Vector(15000, 1500),
        new SAT.Vector(19500, 15000),
        1
    );

    world.ground.push(ground1, ground2);
}
