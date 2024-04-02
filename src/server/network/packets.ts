import {
    ACTION,
    CLIENT_ACTION,
    CLIENT_PACKET_TYPE,
    ClientPacketSchema,
} from "../../shared/enums.js";
import { PacketPipeline, Unpacker } from "../../shared/unpack.js";
import { PlayerController } from "../systems/player_controller.js";

export function createPacketPipeline(controller: PlayerController) {
    const packets = new PacketPipeline();
    packets.add(
        CLIENT_PACKET_TYPE.PING,
        new Unpacker(() => {}, ClientPacketSchema.ping)
    );

    packets.add(
        CLIENT_PACKET_TYPE.MOVE_UPDATE,
        new Unpacker((packet: ClientPacketSchema.moveUpdate, id: number) => {
            controller.move?.call(controller, id, packet[0], packet[1]);
        }, ClientPacketSchema.moveUpdate)
    );

    packets.add(
        CLIENT_PACKET_TYPE.ROTATE,
        new Unpacker((packet: ClientPacketSchema.rotate, id: number) => {
            controller.rotate?.call(controller, id, packet[0]);
        }, ClientPacketSchema.rotate)
    );

    packets.add(
        CLIENT_PACKET_TYPE.ACTION,
        new Unpacker((packet: ClientPacketSchema.action, id: number) => {
            switch (packet[0]) {
                case CLIENT_ACTION.ATTACK:
                    controller.attack?.call(controller, id, packet[1]);
                    break;
                case CLIENT_ACTION.BLOCK:
                    controller.block?.call(controller, id, packet[1]);
                    break;
            }
        }, ClientPacketSchema.action)
    );

    packets.add(
        CLIENT_PACKET_TYPE.REQUEST_OBJECT,
        new Unpacker(
            (packet: ClientPacketSchema.requestObjects, id: number) => {
                controller.requestObjects?.call(controller, id, packet);
            },
            ClientPacketSchema.requestObjects
        )
    );

    return packets;
}
