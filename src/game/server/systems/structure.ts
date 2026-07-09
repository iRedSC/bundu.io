import { GameObject, System } from "@ioengine/server";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { Circle, Vector } from "sat";
import { Physics } from "../components/base.js";
import { Resource } from "../game_objects/resource.js";

export const STRUCTURE_COLLISION_RADIUS = 10;

export class StructureSystem extends System<GameEventMap> {
    constructor() {
        super([], 1);
        this.listen(GameEvent.PlaceStructure, this.placeStructure);
    }

    placeStructure({ structureId, x, y, rotation }: GameEvent.PlaceStructure) {
        const position = new Vector(x, y);
        const struct_physics: Physics = {
            position,
            collisionRadius: STRUCTURE_COLLISION_RADIUS,
            rotation,
            collider: new Circle(position, STRUCTURE_COLLISION_RADIUS),
            solid: true,
            speed: 0,
        };
        const structure = new Resource(struct_physics, {
            id: structureId,
            variant: 0,
        });

        this.world.addObject(structure);
        this.trigger(GameEvent.NewObject, { object: structure });
    }
}
