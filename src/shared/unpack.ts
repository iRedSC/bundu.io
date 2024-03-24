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
    length: number;
    guard: AnyZodTuple;

    constructor(callback: Function, packetLength: number, guard: AnyZodTuple) {
        this.guard = guard;
        this.callback = callback;
        this.length = packetLength;
    }

    unpack(packet: unknown[], playerId?: number) {
        if (packet.length < this.length) {
            // console.log(
            //     `Packet length: ${packet.length}, required length: ${this.length}`
            // );
            return;
        }
        const slicedPacket = packet.slice(0, this.length);
        const parsedPacket = this.guard.safeParse(slicedPacket);
        if (parsedPacket.success === true) {
            this.callback(parsedPacket.data, playerId);
        } else {
            console.log(parsedPacket.error.message);
        }
        if (!playerId && this.length > 0) {
            this.unpack(packet.slice(this.length));
        }
    }
}
