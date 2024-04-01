import {
    ACTION,
    CLIENT_PACKET_TYPE,
    ClientPacketSchema,
} from "../../shared/enums";
import { PacketPipeline, Unpacker } from "../../shared/unpack";
import { PlayerController } from "../player_controller";

export function createPacketPipeline(controller: PlayerController) {
    const packets = new PacketPipeline();
    packets.add(
        CLIENT_PACKET_TYPE.PING,
        new Unpacker(() => {}, ClientPacketSchema.ping)
    );

    packets.add(
        CLIENT_PACKET_TYPE.MOVE_UPDATE,
        new Unpacker((packet: ClientPacketSchema.moveUpdate, id: number) => {
            controller.move(id, packet[0], packet[1]);
        }, ClientPacketSchema.moveUpdate)
    );

    packets.add(
        CLIENT_PACKET_TYPE.ROTATE,
        new Unpacker((packet: ClientPacketSchema.rotate, id: number) => {
            controller.rotate(id, packet[0]);
        }, ClientPacketSchema.rotate)
    );

    packets.add(
        CLIENT_PACKET_TYPE.ACTION,
        new Unpacker((packet: ClientPacketSchema.action, id: number) => {
            switch (packet[0]) {
                case ACTION.ATTACK:
                    controller.attack(id, packet[1]);
                    break;
                case ACTION.BLOCK:
                    controller.block(id, packet[1]);
                    break;
            }
        }, ClientPacketSchema.action)
    );

    packets.add(
        CLIENT_PACKET_TYPE.REQUEST_OBJECT,
        new Unpacker(
            (packet: ClientPacketSchema.requestObjects, id: number) => {
                controller.requestObjects(id, packet[0]);
            },
            ClientPacketSchema.requestObjects
        )
    );

    return packets;
}
