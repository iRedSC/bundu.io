import { radians } from "../../lib/transforms.js";
import {
    CLIENT_ACTION,
    CLIENT_PACKET_TYPE,
    ClientPacketSchema,
} from "../../shared/enums.js";
import { PacketParser } from "../../shared/unpack.js";
import { PlayerController } from "../systems/player_controller.js";

export function createPacketPipeline(controller: PlayerController) {
    const parser = new PacketParser();

    parser.set(CLIENT_PACKET_TYPE.PING, ClientPacketSchema.ping, () => {});

    parser.set(
        CLIENT_PACKET_TYPE.MOVE_UPDATE,
        ClientPacketSchema.moveUpdate,
        (byte: ClientPacketSchema.moveUpdate, id: number) => {
            byte--;
            const y = (byte & 0b11) - 1;
            const x = ((byte >> 2) & 0b11) - 1;
            controller.move?.call(controller, id, x, y);
        }
    );

    parser.set(
        CLIENT_PACKET_TYPE.ROTATE,
        ClientPacketSchema.rotate,
        (rotation: ClientPacketSchema.rotate, id: number) => {
            controller.rotate?.call(controller, id, radians(rotation));
        }
    );
    parser.set(
        CLIENT_PACKET_TYPE.ACTION,
        ClientPacketSchema.action,
        (packet: ClientPacketSchema.action, id: number) => {
            switch (packet[0]) {
                case CLIENT_ACTION.ATTACK:
                    controller.attack?.call(controller, id, packet[1]);
                    break;
                case CLIENT_ACTION.BLOCK:
                    controller.block?.call(controller, id, packet[1]);
                    break;
            }
        }
    );

    parser.set(
        CLIENT_PACKET_TYPE.REQUEST_OBJECT,
        ClientPacketSchema.requestObjects,
        (packet: ClientPacketSchema.requestObjects, id: number) => {
            controller.requestObjects?.call(controller, id, packet);
        }
    );

    parser.set(
        CLIENT_PACKET_TYPE.SELECT_ITEM,
        ClientPacketSchema.selectItem,
        (packet: ClientPacketSchema.selectItem, id: number) => {
            controller.selectItem?.call(controller, id, packet);
        }
    );

    parser.set(
        CLIENT_PACKET_TYPE.CRAFT_ITEM,
        ClientPacketSchema.craftItem,
        (packet: ClientPacketSchema.craftItem, id: number) => {
            controller.craftItem?.call(controller, id, packet);
        }
    );

    parser.set(
        CLIENT_PACKET_TYPE.CHAT_MESSAGE,
        ClientPacketSchema.chatMessage,
        (packet: ClientPacketSchema.chatMessage, id: number) => {
            controller.chatMessage?.call(controller, id, packet);
        }
    );

    parser.set(
        CLIENT_PACKET_TYPE.DROP_ITEM,
        ClientPacketSchema.dropItem,
        (packet: ClientPacketSchema.dropItem, id: number) => {
            controller.dropItem?.call(controller, id, packet[0], packet[1]);
        }
    );
    return parser;
}
