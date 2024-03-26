import { PACKET_TYPE, Schemas } from "../shared/enums";
import { PacketPipeline, Unpacker } from "../shared/unpack";
import { World } from "./game_objects/world";

export function createPipeline(packetPipeline: PacketPipeline, world: World) {
    packetPipeline.add(
        PACKET_TYPE.NEW_PLAYER,
        new Unpacker(world.newPlayer.bind(world), Schemas.newPlayer)
    );
    packetPipeline.add(
        PACKET_TYPE.MOVE_OBJECT,
        new Unpacker(world.moveObject.bind(world), Schemas.moveObject)
    );
    packetPipeline.add(
        PACKET_TYPE.ROTATE_OBJECT,
        new Unpacker(world.rotateObject.bind(world), Schemas.rotateObject)
    );

    packetPipeline.add(
        PACKET_TYPE.DELETE_OBJECT,
        new Unpacker(world.deleteObject.bind(world), Schemas.deleteObject)
    );

    packetPipeline.add(
        PACKET_TYPE.NEW_STRUCTURE,
        new Unpacker(world.newStructure.bind(world), Schemas.newStructure)
    );
    packetPipeline.add(
        PACKET_TYPE.NEW_ENTITY,
        new Unpacker(world.newEntity.bind(world), Schemas.newEntity)
    );

    packetPipeline.add(
        PACKET_TYPE.NEW_PLAYER,
        new Unpacker(world.newPlayer.bind(world), Schemas.newPlayer)
    );

    packetPipeline.add(
        PACKET_TYPE.LOAD_GROUND,
        new Unpacker(world.loadGround.bind(world), Schemas.loadGround)
    );

    packetPipeline.add(
        PACKET_TYPE.STARTING_INFO,
        new Unpacker(world.setPlayer.bind(world), Schemas.startingInfo)
    );
}
