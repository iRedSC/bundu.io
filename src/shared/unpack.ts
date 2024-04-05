import { ZodTypeAny } from "zod";
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

    unpack(packet: unknown, data?: any) {
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
        unpacker.unpack(packet.slice(1), data);
    }
}

type UnpackerCallback<T> = (packet: T, data: any) => void;
export class Unpacker {
    callback: Function;
    guard: ZodTypeAny;

    constructor(callback: UnpackerCallback<any>, guard: ZodTypeAny) {
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
            console.error(packet + "\n\n" + parsedPacket.error.message);
        }
        if (!playerId && data.length > 0) {
            this.unpack(data.slice(1));
        }
    }
}
