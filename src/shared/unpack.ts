import { AnyZodTuple } from "zod";
import Logger from "js-logger";

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

export class Unpacker {
    callback: Function;
    guard: AnyZodTuple;

    constructor(callback: Function, guard: AnyZodTuple) {
        this.guard = guard;
        this.callback = callback;
    }

    unpack(packet: unknown[], playerId?: number) {
        const length = this.guard.items.length;
        if (packet.length < length) {
            logger.warn(
                `Packet length: ${packet.length}, required length: ${length}`
            );
            return;
        }
        const slicedPacket = packet.slice(0, length);
        const parsedPacket = this.guard.safeParse(slicedPacket);
        if (parsedPacket.success === true) {
            this.callback(parsedPacket.data, playerId);
        } else {
            logger.error(parsedPacket.error.message);
        }
        if (!playerId && length > 0) {
            this.unpack(packet.slice(length));
        }
    }
}
