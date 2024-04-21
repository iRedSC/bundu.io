import { SCHEMA, OBJECT_CLASS, PACKET } from "../../shared/enums";
import { PacketParser } from "../../shared/unpack";
import { World } from "../world/world";

export function createPipeline(packetPipeline: PacketParser, world: World) {
    const newObjectPipeline = new PacketParser();

    packetPipeline.set(
        PACKET.SERVER.MOVE_OBJECT,
        SCHEMA.SERVER.MOVE_OBJECT,
        world.moveObject.bind(world)
    );

    packetPipeline.set(
        PACKET.SERVER.ROTATE_OBJECT,
        SCHEMA.SERVER.ROTATE_OBJECT,
        world.rotateObject.bind(world)
    );

    packetPipeline.set(
        PACKET.SERVER.DELETE_OBJECT,
        SCHEMA.SERVER.DELETE_OBJECT,
        world.deleteObject.bind(world)
    );

    packetPipeline.set(
        PACKET.SERVER.NEW_OBJECT,
        SCHEMA.SERVER.NEW_OBJECT,
        newObjectPipeline.unpack.bind(newObjectPipeline)
    );

    packetPipeline.set(
        PACKET.SERVER.LOAD_GROUND,
        SCHEMA.SERVER.LOAD_GROUND,
        world.loadGround.bind(world)
    );

    packetPipeline.set(
        PACKET.SERVER.STARTING_INFO,
        SCHEMA.SERVER.STARTING_INFO,
        world.setPlayer.bind(world)
    );

    packetPipeline.set(
        PACKET.SERVER.UPDATE_GEAR,
        SCHEMA.SERVER.UPDATE_GEAR,
        world.updateGear.bind(world)
    );

    packetPipeline.set(
        PACKET.SERVER.ACTION,
        SCHEMA.SERVER.EVENT,
        world.action.bind(world)
    );

    packetPipeline.set(
        PACKET.SERVER.CHAT_MESSAGE,
        SCHEMA.SERVER.CHAT_MESSAGE,
        world.chatMessage.bind(world)
    );

    packetPipeline.set(
        PACKET.SERVER.UNLOAD_OBJECT,
        SCHEMA.SERVER.UNLOAD_OBJECT,
        world.unloadObject.bind(world)
    );

    newObjectPipeline.set(
        OBJECT_CLASS.ENTITY,
        SCHEMA.NEW_OBJECT.ENTITY,
        world.newEntity.bind(world)
    );

    newObjectPipeline.set(
        OBJECT_CLASS.PLAYER,
        SCHEMA.NEW_OBJECT.PLAYER,
        world.newPlayer.bind(world)
    );

    newObjectPipeline.set(
        OBJECT_CLASS.STRUCTURE,
        SCHEMA.NEW_OBJECT.STRUCTURE,
        world.newStructure.bind(world)
    );
}
