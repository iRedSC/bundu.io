import { SCHEMA, OBJECT_CLASS, PACKET } from "../../shared/enums";
import { PacketParser } from "../../shared/unpack";
import { World } from "../world/world";

export function createParser(parser: PacketParser, world: World) {
    const newObjectParser = new PacketParser();

    parser.set(
        PACKET.SERVER.NEW_OBJECT,
        SCHEMA.SERVER.NEW_OBJECT,
        newObjectParser.unpack.bind(newObjectParser)
    );

    newObjectParser.set(
        OBJECT_CLASS.ENTITY,
        SCHEMA.NEW_OBJECT.ENTITY,
        world.newEntity.bind(world)
    );

    newObjectParser.set(
        OBJECT_CLASS.PLAYER,
        SCHEMA.NEW_OBJECT.PLAYER,
        world.newPlayer.bind(world)
    );

    newObjectParser.set(
        OBJECT_CLASS.STRUCTURE,
        SCHEMA.NEW_OBJECT.STRUCTURE,
        world.newStructure.bind(world)
    );

    const eventParser = new PacketParser();

    parser.set(
        PACKET.SERVER.EVENT,
        SCHEMA.SERVER.EVENT,
        eventParser.unpack.bind(eventParser)
    );

    eventParser.set(
        PACKET.EVENT.ATTACK,
        SCHEMA.EVENT.ATTACK,
        world.attack.bind(world)
    );
    eventParser.set(
        PACKET.EVENT.BLOCK,
        SCHEMA.EVENT.BLOCK,
        world.block.bind(world)
    );
    eventParser.set(
        PACKET.EVENT.HURT,
        SCHEMA.EVENT.HURT,
        world.hurt.bind(world)
    );

    parser.set(
        PACKET.SERVER.MOVE_OBJECT,
        SCHEMA.SERVER.MOVE_OBJECT,
        world.moveObject.bind(world)
    );

    parser.set(
        PACKET.SERVER.ROTATE_OBJECT,
        SCHEMA.SERVER.ROTATE_OBJECT,
        world.rotateObject.bind(world)
    );

    parser.set(
        PACKET.SERVER.DELETE_OBJECT,
        SCHEMA.SERVER.DELETE_OBJECT,
        world.deleteObject.bind(world)
    );

    parser.set(
        PACKET.SERVER.LOAD_GROUND,
        SCHEMA.SERVER.LOAD_GROUND,
        world.loadGround.bind(world)
    );

    parser.set(
        PACKET.SERVER.STARTING_INFO,
        SCHEMA.SERVER.STARTING_INFO,
        world.setPlayer.bind(world)
    );

    parser.set(
        PACKET.SERVER.UPDATE_GEAR,
        SCHEMA.SERVER.UPDATE_GEAR,
        world.updateGear.bind(world)
    );

    parser.set(
        PACKET.SERVER.CHAT_MESSAGE,
        SCHEMA.SERVER.CHAT_MESSAGE,
        world.chatMessage.bind(world)
    );

    parser.set(
        PACKET.SERVER.UNLOAD_OBJECT,
        SCHEMA.SERVER.UNLOAD_OBJECT,
        world.unloadObject.bind(world)
    );
}
