import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import {
    TILE_SIZE,
    pointToTile,
    type TileRot,
} from "@bundu/shared/tiles";
import { System, type World } from "../engine";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { Physics } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { Structure } from "../game_objects/structure.js";
import {
    makeTileEntity,
    tileEntityPhysics,
} from "../game_objects/tile_entity.js";

export class StructureSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [], 1);
        this.listen(GameEvent.PlaceStructure, this.placeStructure);
        this.listen(
            GameEvent.PlaceSelectedStructure,
            this.placeSelectedStructure
        );
    }

    /** Clears selection, notifies client, and places at the player's tile. */
    placeSelectedStructure({
        object: player,
    }: GameEvent.PlaceSelectedStructure) {
        const data = player.get(PlayerData);
        const physics = player.get(Physics);
        const selectedStructure = data.selectedStructure;
        if (selectedStructure.id === -1) return;

        selectedStructure.cooldown_timestamp = this.world.gameTime + 1000;

        this.world.context.playerPacketManager.set(
            player.id,
            ServerPacket.SetSelectedStructure,
            {
                structureId: -1,
                structureSize: TILE_SIZE,
            }
        );

        const tile = pointToTile(physics.position);
        this.trigger(GameEvent.PlaceStructure, {
            structureId: selectedStructure.id,
            x: tile.x,
            y: tile.y,
            rotation: 0,
        });

        selectedStructure.id = -1;
    }

    placeStructure({ structureId, x, y, rotation }: GameEvent.PlaceStructure) {
        const rot = (rotation % 4) as TileRot;
        const origin = { x, y };
        const tile = makeTileEntity(origin, rot);

        if (!this.world.context.occupancy.canPlace(tile.occupied)) return;

        const structure = new Structure(
            tileEntityPhysics(origin, rot),
            { id: structureId, variant: 0 },
            tile
        );
        this.world.addObject(structure);
    }
}
