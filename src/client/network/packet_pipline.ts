import {
    NewObjectSchema,
    OBJECT_CLASS,
    PACKET_TYPE,
    ServerPacketSchema,
} from "../../shared/enums";
import { PacketParser } from "../../shared/unpack";
import { World } from "../world/world";

export function createPipeline(packetPipeline: PacketParser, world: World) {
    const newObjectPipeline = new PacketParser();

    packetPipeline.set(
        PACKET_TYPE.MOVE_OBJECT,
        ServerPacketSchema.moveObject,
        world.moveObject.bind(world)
    );

    packetPipeline.set(
        PACKET_TYPE.ROTATE_OBJECT,
        ServerPacketSchema.rotateObject,
        world.rotateObject.bind(world)
    );

    packetPipeline.set(
        PACKET_TYPE.DELETE_OBJECT,
        ServerPacketSchema.deleteObject,
        world.deleteObject.bind(world)
    );

    packetPipeline.set(
        PACKET_TYPE.NEW_OBJECT,
        ServerPacketSchema.newObject,
        newObjectPipeline.unpack.bind(newObjectPipeline)
    );

    packetPipeline.set(
        PACKET_TYPE.LOAD_GROUND,
        ServerPacketSchema.loadGround,
        world.loadGround.bind(world)
    );

    packetPipeline.set(
        PACKET_TYPE.STARTING_INFO,
        ServerPacketSchema.startingInfo,
        world.setPlayer.bind(world)
    );

    packetPipeline.set(
        PACKET_TYPE.UPDATE_GEAR,
        ServerPacketSchema.updateGear,
        world.updateGear.bind(world)
    );

    packetPipeline.set(
        PACKET_TYPE.ACTION,
        ServerPacketSchema.action,
        world.action.bind(world)
    );

    packetPipeline.set(
        PACKET_TYPE.CHAT_MESSAGE,
        ServerPacketSchema.chatMessage,
        world.chatMessage.bind(world)
    );

    packetPipeline.set(
        PACKET_TYPE.UNLOAD_OBJECT,
        ServerPacketSchema.unloadObject,
        world.unloadObject.bind(world)
    );

    newObjectPipeline.set(
        OBJECT_CLASS.ENTITY,
        NewObjectSchema.newEntity,
        world.newEntity.bind(world)
    );

    newObjectPipeline.set(
        OBJECT_CLASS.PLAYER,
        NewObjectSchema.newPlayer,
        world.newPlayer.bind(world)
    );

    newObjectPipeline.set(
        OBJECT_CLASS.STRUCTURE,
        NewObjectSchema.newStructure,
        world.newStructure.bind(world)
    );
}
