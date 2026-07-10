import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { System, type World } from "../engine";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { Circle, Vector } from "sat";
import { Physics } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { Structure } from "../game_objects/structure.js";
import { playerPacketManager } from "../network/managers.js";

export const STRUCTURE_COLLISION_RADIUS = 10;

export class StructureSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [], 1);
        this.listen(GameEvent.PlaceStructure, this.placeStructure);
        this.listen(
            GameEvent.PlaceSelectedStructure,
            this.placeSelectedStructure
        );
    }

    /** Clears selection, notifies client, and places at the player's position. */
    placeSelectedStructure({
        object: player,
    }: GameEvent.PlaceSelectedStructure) {
        const data = player.get(PlayerData);
        const physics = player.get(Physics);
        const selectedStructure = data.selectedStructure;
        if (selectedStructure.id === -1) return;

        selectedStructure.cooldown_timestamp = this.world.gameTime + 1000;

        playerPacketManager.set(
            player.id,
            ServerPacket.SetSelectedStructure,
            {
                structureId: -1,
                structureSize: STRUCTURE_COLLISION_RADIUS,
            }
        );

        this.trigger(GameEvent.PlaceStructure, {
            structureId: selectedStructure.id,
            x: physics.position.x,
            y: physics.position.y,
            rotation: 0,
        });

        selectedStructure.id = -1;
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
