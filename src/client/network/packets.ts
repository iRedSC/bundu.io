class PacketManager {
    children: Map<number, PacketManager | PacketUnpacker>;

    constructor() {
        this.children = new Map();
    }

    addChild(id: number, manager: PacketManager | PacketUnpacker) {
        this.children.set(id, manager);
    }

    unpack(packet: unknown[]) {
        const type = packet[0];
        if (typeof type !== "number") {
            return;
        }
        const child = this.children.get(type);
        if (child instanceof PacketManager && Array.isArray(packet[1])) {
            child.unpackList(packet[1]);
        } else if (child && Array.isArray(packet[1])) {
            child.unpack(packet[1]);
        }
    }

    unpackList(packet: unknown[]) {
        for (let item of packet) {
            if (Array.isArray(item)) {
                this.unpack(item);
            }
        }
    }
}

type PacketValue = "string" | "number";
class PacketUnpacker {
    structure: { [key: string]: PacketValue };
    callback: Function;

    constructor(structure: { [key: string]: PacketValue }, callback: Function) {
        this.structure = structure;
        this.callback = callback;
    }

    unpack(packet: unknown[]) {
        const returnObject: { [key: string]: unknown } = {};
        const keys = Object.keys(this.structure);
        for (let i = 0; i < packet.length; i++) {
            const packetElement = packet[i];
            const typeElement = this.structure[keys[i]];

            if (!(typeof packetElement === typeElement)) {
                break;
            }
            returnObject[keys[i]] = packetElement;
        }
        if (keys.every((item) => item in returnObject)) {
            this.callback(returnObject);
        }
    }
}
