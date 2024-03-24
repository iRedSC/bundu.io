import { PACKET_TYPE, Schemas } from "../shared/enums";
import { PacketPipeline, Unpacker } from "../shared/unpack";
import { World } from "./game_objects/world";

export function createPipeline(packetPipeline: PacketPipeline, world: World) {
    packetPipeline.add(
        PACKET_TYPE.NEW_PLAYER,
        new Unpacker(world.newPlayer.bind(world), 9, Schemas.newPlayer)
    );
    packetPipeline.add(
        PACKET_TYPE.MOVE_OBJECT,
        new Unpacker(world.moveObject.bind(world), 5, Schemas.moveObject)
    );
    packetPipeline.add(
        PACKET_TYPE.NEW_STRUCTURE,
        new Unpacker(world.newStructure.bind(world), 6, Schemas.newStructure)
    );
    packetPipeline.add(
        PACKET_TYPE.NEW_ENTITY,
        new Unpacker(world.newEntity.bind(world), 6, Schemas.newEntity)
    );

    packetPipeline.add(
        PACKET_TYPE.LOAD_GROUND,
        new Unpacker(world.loadGround.bind(world), 5, Schemas.loadGround)
    );
}
