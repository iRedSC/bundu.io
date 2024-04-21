import {
    NewObjectSchema,
    OBJECT_CLASS,
    PACKET_TYPE,
    Schema.Server,
} from "../../shared/enums";
import { PacketParser } from "../../shared/unpack";
import { World } from "../world/world";

export function createPipeline(packetPipeline: PacketParser, world: World) {
    const newObjectPipeline = new PacketParser();

    packetPipeline.set(
        PACKET_TYPE.MOVE_OBJECT,
        Schema.Server.moveObject,
        world.moveObject.bind(world)
    );

    packetPipeline.set(
        PACKET_TYPE.ROTATE_OBJECT,
        Schema.Server.rotateObject,
        world.rotateObject.bind(world)
    );

    packetPipeline.set(
        PACKET_TYPE.DELETE_OBJECT,
        Schema.Server.deleteObject,
        world.deleteObject.bind(world)
    );

    packetPipeline.set(
        PACKET_TYPE.NEW_OBJECT,
        Schema.Server.newObject,
        newObjectPipeline.unpack.bind(newObjectPipeline)
    );

    packetPipeline.set(
        PACKET_TYPE.LOAD_GROUND,
        Schema.Server.loadGround,
        world.loadGround.bind(world)
    );

    packetPipeline.set(
        PACKET_TYPE.STARTING_INFO,
        Schema.Server.startingInfo,
        world.setPlayer.bind(world)
    );

    packetPipeline.set(
        PACKET_TYPE.UPDATE_GEAR,
        Schema.Server.updateGear,
        world.updateGear.bind(world)
    );

    packetPipeline.set(
        PACKET_TYPE.ACTION,
        Schema.Server.action,
        world.action.bind(world)
    );

    packetPipeline.set(
        PACKET_TYPE.CHAT_MESSAGE,
        Schema.Server.chatMessage,
        world.chatMessage.bind(world)
    );

    packetPipeline.set(
        PACKET_TYPE.UNLOAD_OBJECT,
        Schema.Server.unloadObject,
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
