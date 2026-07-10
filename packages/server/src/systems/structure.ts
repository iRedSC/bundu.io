import { System, type World } from "../engine";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { Circle, Vector } from "sat";
import { Physics } from "../components/base.js";
import { Structure } from "../game_objects/structure.js";

export const STRUCTURE_COLLISION_RADIUS = 10;

export class StructureSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [], 1);
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
        const structure = new Structure(struct_physics, {
            id: structureId,
            variant: 0,
        });

        this.world.addObject(structure);
    }
}
