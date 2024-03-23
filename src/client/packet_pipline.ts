import { z } from "zod";
import { PACKET_TYPE } from "../shared/enums";
import { PacketPipeline, Unpacker } from "./game_objects/unpack";
import { World } from "./game_objects/world";

export namespace Schemas {
    export const Packet = {
        newPlayer: z.tuple([
            z.number(), // id
            z.number(), // x
            z.number(), // y
            z.number(), // rot
            z.string(), // name
            z.number(), // hand
            z.number(), // helm
            z.number(), // skin
            z.number(), // backpack
        ]),
        moveObject: z.tuple([
            z.number(), // id
            z.number(), // time
            z.number(), // x
            z.number(), // y
            z.number(), // rot
        ]),
    };

    export type newPlayer = z.infer<typeof Packet.newPlayer>;
    export type moveObject = z.infer<typeof Packet.moveObject>;
}

export function createPipeline(packetPipeline: PacketPipeline, world: World) {
    packetPipeline.add(
        PACKET_TYPE.NEW_PLAYER,
        new Unpacker(world.newPlayer.bind(world), 9, Schemas.Packet.newPlayer)
    );
    packetPipeline.add(
        PACKET_TYPE.MOVE_OBJECT,
        new Unpacker(world.moveObject.bind(world), 5, Schemas.Packet.moveObject)
    );
}
