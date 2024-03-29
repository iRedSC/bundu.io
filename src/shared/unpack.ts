import { AnyZodTuple } from "zod";
export class PacketPipeline {
    unpackers: Map<number, Unpacker>;

    constructor() {
        this.unpackers = new Map();
    }

    add(id: number, unpacker: Unpacker) {
        this.unpackers.set(id, unpacker);
    }

    unpack(packet: unknown[], playerId?: number) {
        // find packet id
        console.log(packet);

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
        if (typeof packet === "string") {
            packet = JSON.parse(packet);
        }
        if (packet.length < length) {
            console.log(
                `Packet length: ${packet.length}, required length: ${length}`
            );
            return;
        }
        const slicedPacket = packet.slice(0, length);
        const parsedPacket = this.guard.safeParse(slicedPacket);
        if (parsedPacket.success === true) {
            this.callback(parsedPacket.data, playerId);
        } else {
            console.log(parsedPacket.error.message);
        }
        if (!playerId && length > 0) {
            this.unpack(packet.slice(length));
        }
    }
}
