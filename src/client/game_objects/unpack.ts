import { PACKET_TYPE, PACKET } from "../../shared/enums";
export class Unpacker {
    unpackers: Map<PACKET_TYPE, Function>;

    constructor() {
        this.unpackers = new Map();
    }

    add(id: PACKET_TYPE, unpacker: Function) {
        this.unpackers.set(id, unpacker);
    }

    unpack(packet: PACKET.FULL.ANY) {
        const id = packet[0];
        const time = packet[1];
        const unpacker = this.unpackers.get(id);
        if (!unpacker) {
            return;
        }
        for (const _packet of packet[2]) {
            unpacker(time, _packet);
        }
    }
}
