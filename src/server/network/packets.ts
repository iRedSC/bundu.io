import { radians } from "../../lib/transforms.js";
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
        new Unpacker((byte: ClientPacketSchema.moveUpdate, id: number) => {
            byte--;
            const y = (byte & 0b11) - 1;
            const x = ((byte >> 2) & 0b11) - 1;
            console.log(x, y);
            controller.move?.call(controller, id, x, y);
        }, ClientPacketSchema.moveUpdate)
    );

    packets.add(
        CLIENT_PACKET_TYPE.ROTATE,
        new Unpacker((rotation: ClientPacketSchema.rotate, id: number) => {
            controller.rotate?.call(controller, id, radians(rotation));
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
