import { radians } from "../../lib/transforms.js";
import { PACKET, SCHEMA } from "../../shared/enums.js";
import { PacketParser } from "../../shared/unpack.js";
import { PlayerController } from "../systems/player_controller.js";

export class ClientPacketHandler {
    players: Map<number, { [key: number]: any[] }>;

    constructor() {
        this.players = new Map();
    }

    get(player: number) {
        if (!this.players.get(player)) {
            this.players.set(player, {});
        }
        return this.players.get(player)!;
    }

    add(player: number, packet: [number, ...unknown[]]) {
        const id = packet.splice(0, 1)[0] as number;
        this.get(player)[id] = packet;
    }
    clear() {
        this.players.clear();
    }

    unpack(parser: PacketParser, player?: number) {
        if (player === undefined) {
            for (const [playerId, packets] of this.players.entries()) {
                for (const [id, packet] of Object.entries(packets)) {
                    parser.parsers[id](packet, { id: playerId });
                }
            }
            return;
        }
        const packets = this.get(player);
        for (const [id, packet] of Object.entries(packets)) {
            parser.parsers[id](packet, { id: player });
        }
    }
}

type PlayerID = { id: number };

export function createParser(controller: PlayerController) {
    const parser = new PacketParser();

    parser.set(PACKET.CLIENT.PING, SCHEMA.CLIENT.PING, () => {});

    parser.set(
        PACKET.CLIENT.MOVE_UPDATE,
        SCHEMA.CLIENT.MOVE_UPDATE,
        (byte: SCHEMA.CLIENT.MOVE_UPDATE, { id }: PlayerID) => {
            byte--;
            const y = (byte & 0b11) - 1;
            const x = ((byte >> 2) & 0b11) - 1;
            controller.move?.call(controller, id, x, y);
        }
    );

    parser.set(
        PACKET.CLIENT.ROTATE,
        SCHEMA.CLIENT.ROTATE,
        (rotation: SCHEMA.CLIENT.ROTATE, { id }: PlayerID) => {
            controller.rotate?.call(controller, id, radians(rotation));
        }
    );
    parser.set(
        PACKET.CLIENT.ACTION,
        SCHEMA.CLIENT.ACTION,
        (packet: SCHEMA.CLIENT.ACTION, { id }: PlayerID) => {
            switch (packet[0]) {
                case PACKET.ACTION.ATTACK:
                    controller.attack?.call(controller, id, packet[1]);
                    break;
                case PACKET.ACTION.BLOCK:
                    controller.block?.call(controller, id, packet[1]);
                    break;
            }
        }
    );

    parser.set(
        PACKET.CLIENT.REQUEST_OBJECTS,
        SCHEMA.CLIENT.REQUEST_OBJECTS,
        (packet: SCHEMA.CLIENT.REQUEST_OBJECTS, { id }: PlayerID) => {
            controller.requestObjects?.call(controller, id, packet);
        }
    );

    parser.set(
        PACKET.CLIENT.SELECT_ITEM,
        SCHEMA.CLIENT.SELECT_ITEM,
        (packet: SCHEMA.CLIENT.SELECT_ITEM, { id }: PlayerID) => {
            controller.selectItem?.call(controller, id, packet);
        }
    );

    parser.set(
        PACKET.CLIENT.CRAFT_ITEM,
        SCHEMA.CLIENT.CRAFT_ITEM,
        (packet: SCHEMA.CLIENT.CRAFT_ITEM, { id }: PlayerID) => {
            controller.craftItem?.call(controller, id, packet);
        }
    );

    parser.set(
        PACKET.CLIENT.CHAT_MESSAGE,
        SCHEMA.CLIENT.CHAT_MESSAGE,
        (packet: SCHEMA.CLIENT.CHAT_MESSAGE, { id }: PlayerID) => {
            controller.chatMessage?.call(controller, id, packet);
        }
    );

    parser.set(
        PACKET.CLIENT.DROP_ITEM,
        SCHEMA.CLIENT.DROP_ITEM,
        (packet: SCHEMA.CLIENT.DROP_ITEM, { id }: PlayerID) => {
            controller.dropItem?.call(controller, id, packet[0], packet[1]);
        }
    );
    return parser;
}
