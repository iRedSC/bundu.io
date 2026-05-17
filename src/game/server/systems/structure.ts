import { GameObject, System } from "@ioengine/server";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { moveInDirection } from "../../../ioengine/lib/transforms.js";
import { Circle, Vector } from "sat";
import type { BasicPoint } from "@ioengine/lib";
import { Physics } from "../components/base.js";
import { Resource } from "../game_objects/resource.js";

export const STRUCTURE_COLLISION_RADIUS = 10;

function pointToVec(point: BasicPoint) {
    return new Vector(point.x, point.y);
}

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

    calculatePlacement({
        object: player,
    }: GameEvent.CalculateStructurePlacement) {
        const physics = player.get(Physics);
        if (!physics) return;

        const position = pointToVec(
            moveInDirection(
                physics.position.clone(),
                physics.rotation,
                STRUCTURE_COLLISION_RADIUS
            )
        );
    }
}
