import {
    NewObjectSchema,
    OBJECT_CLASS,
    PACKET_TYPE,
    ServerPacketSchema,
} from "../shared/enums";
import { PacketPipeline, Unpacker } from "../shared/unpack";
import { World } from "./game_objects/world";

export function createPipeline(packetPipeline: PacketPipeline, world: World) {
    const newObjectPipeline = new PacketPipeline();

    packetPipeline.add(
        PACKET_TYPE.MOVE_OBJECT,
        new Unpacker(
            world.moveObject.bind(world),
            ServerPacketSchema.moveObject
        )
    );
    packetPipeline.add(
        PACKET_TYPE.ROTATE_OBJECT,
        new Unpacker(
            world.rotateObject.bind(world),
            ServerPacketSchema.rotateObject
        )
    );

    packetPipeline.add(
        PACKET_TYPE.DELETE_OBJECT,
        new Unpacker(
            world.deleteObject.bind(world),
            ServerPacketSchema.deleteObject
        )
    );

    packetPipeline.add(
        PACKET_TYPE.NEW_OBJECT,
        new Unpacker(
            newObjectPipeline.unpack.bind(newObjectPipeline),
            ServerPacketSchema.newObject
        )
    );
    packetPipeline.add(
        PACKET_TYPE.LOAD_GROUND,
        new Unpacker(
            world.loadGround.bind(world),
            ServerPacketSchema.loadGround
        )
    );

    packetPipeline.add(
        PACKET_TYPE.STARTING_INFO,
        new Unpacker(
            world.setPlayer.bind(world),
            ServerPacketSchema.startingInfo
        )
    );

    packetPipeline.add(
        PACKET_TYPE.UPDATE_GEAR,
        new Unpacker(
            world.updateGear.bind(world),
            ServerPacketSchema.updateGear
        )
    );

    packetPipeline.add(
        PACKET_TYPE.ACTION,
        new Unpacker(world.action.bind(world), ServerPacketSchema.action)
    );

    newObjectPipeline.add(
        OBJECT_CLASS.ENTITY,
        new Unpacker(world.newEntity.bind(world), NewObjectSchema.newEntity)
    );

    newObjectPipeline.add(
        OBJECT_CLASS.PLAYER,
        new Unpacker(world.newPlayer.bind(world), NewObjectSchema.newPlayer)
    );

    newObjectPipeline.add(
        OBJECT_CLASS.STRUCTURE,
        new Unpacker(
            world.newStructure.bind(world),
            NewObjectSchema.newStructure
        )
    );
}
