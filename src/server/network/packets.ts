import { radians } from "../../lib/transforms.js";
import {
    CLIENT_ACTION,
    CLIENT_PACKET_TYPE,
    Schema.Client,
} from "../../shared/enums.js";
import { PacketParser } from "../../shared/unpack.js";
import { PlayerController } from "../systems/player_controller.js";

type PlayerID = { id: number };

export function createPacketPipeline(controller: PlayerController) {
    const parser = new PacketParser();

    parser.set(CLIENT_PACKET_TYPE.PING, Schema.Client.ping, () => {});

    parser.set(
        CLIENT_PACKET_TYPE.MOVE_UPDATE,
        Schema.Client.moveUpdate,
        (byte: Schema.Client.moveUpdate, { id }: PlayerID) => {
            byte--;
            const y = (byte & 0b11) - 1;
            const x = ((byte >> 2) & 0b11) - 1;
            controller.move?.call(controller, id, x, y);
        }
    );

    parser.set(
        CLIENT_PACKET_TYPE.ROTATE,
        Schema.Client.rotate,
        (rotation: Schema.Client.rotate, { id }: PlayerID) => {
            controller.rotate?.call(controller, id, radians(rotation));
        }
    );
    parser.set(
        CLIENT_PACKET_TYPE.ACTION,
        Schema.Client.action,
        (packet: Schema.Client.action, { id }: PlayerID) => {
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
        Schema.Client.requestObjects,
        (packet: Schema.Client.requestObjects, { id }: PlayerID) => {
            controller.requestObjects?.call(controller, id, packet);
        }
    );

    parser.set(
        CLIENT_PACKET_TYPE.SELECT_ITEM,
        Schema.Client.selectItem,
        (packet: Schema.Client.selectItem, { id }: PlayerID) => {
            controller.selectItem?.call(controller, id, packet);
        }
    );

    parser.set(
        CLIENT_PACKET_TYPE.CRAFT_ITEM,
        Schema.Client.craftItem,
        (packet: Schema.Client.craftItem, { id }: PlayerID) => {
            controller.craftItem?.call(controller, id, packet);
        }
    );

    parser.set(
        CLIENT_PACKET_TYPE.CHAT_MESSAGE,
        Schema.Client.chatMessage,
        (packet: Schema.Client.chatMessage, { id }: PlayerID) => {
            controller.chatMessage?.call(controller, id, packet);
        }
    );

    parser.set(
        CLIENT_PACKET_TYPE.DROP_ITEM,
        Schema.Client.dropItem,
        (packet: Schema.Client.dropItem, { id }: PlayerID) => {
            controller.dropItem?.call(controller, id, packet[0], packet[1]);
        }
    );
    return parser;
}
