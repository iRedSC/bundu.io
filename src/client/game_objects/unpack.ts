import { PACKET_TYPE } from "../../shared/enums";
import { AnyZodTuple } from "zod";
export class PacketPipeline {
    unpackers: Map<PACKET_TYPE, Unpacker>;

    constructor() {
        this.unpackers = new Map();
    }

    add(id: PACKET_TYPE, unpacker: Unpacker) {
        this.unpackers.set(id, unpacker);
    }

    unpack(packet: unknown[]) {
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
        unpacker.unpack(packet.slice(1));
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

    unpack(packet: unknown[]) {
        if (packet.length < this.length) {
            // console.log(
            //     `Packet length: ${packet.length}, required length: ${this.length}`
            // );
            return;
        }
        const slicedPacket = packet.slice(0, this.length);
        const parsedPacket = this.guard.safeParse(slicedPacket);
        if (parsedPacket.success === true) {
            this.callback(parsedPacket.data);
        } else {
            console.log(parsedPacket.error.message);
        }
        this.unpack(packet.slice(this.length));
    }
}
