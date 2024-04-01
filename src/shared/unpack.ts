import { AnyZodTuple } from "zod";
import Logger from "js-logger";
import { ClientPacketSchema, ServerPacketSchema } from "./enums";

const logger = Logger.get("Packet");

export class PacketPipeline {
    unpackers: Map<number, Unpacker>;

    constructor() {
        this.unpackers = new Map();
    }

    add(id: number, unpacker: Unpacker) {
        this.unpackers.set(id, unpacker);
    }

    unpack(packet: unknown, playerId?: number) {
        // find packet id
        if (!(packet instanceof Array)) {
            logger.error(`Packet ${packet} is not an array.`);
            return;
        }

        const id = packet[0];
        if (typeof id !== "number") {
            return;
        }

        // find unpacker linked to packet id
        const unpacker = this.unpackers.get(id);
        if (!unpacker) {
            return;
        }
        // feed packet data to unpacker
        unpacker.unpack(packet.slice(1), playerId);
    }
}

type UnpackerCallback<T> = (packet: T, id: number) => void;
export class Unpacker {
    callback: Function;
    guard: AnyZodTuple;

    constructor(callback: UnpackerCallback<any>, guard: AnyZodTuple) {
        this.guard = guard;
        this.callback = callback;
    }

    unpack(data: unknown[], playerId?: number) {
        const packet = data[0];
        if (!packet) {
            return;
        }
        const parsedPacket = this.guard.safeParse(packet);
        if (parsedPacket.success === true) {
            this.callback(parsedPacket.data, playerId);
        } else {
            logger.error(parsedPacket.error.message);
        }
        if (!playerId && length > 0) {
            this.unpack(data.slice(1));
        }
    }
}
