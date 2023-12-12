class PacketManager {
    children: Map<number, PacketManager | PacketUnpacker>;

    constructor() {
        this.children = new Map();
    }

    addChild(id: number, manager: PacketManager | PacketUnpacker) {
        this.children.set(id, manager);
    }

    unpack(packet: unknown[], isList: boolean = false) {
        if (isList) {
            for (let item of packet) {
                if (Array.isArray(item)) {
                    this.unpack(item);
                }
            }
        }
        const type = packet[0];
        console.log(type);
        if (typeof type !== "number") {
            return;
        }
        const child = this.children.get(type);
        if (child && Array.isArray(packet[1])) {
            child.unpack(packet[1], true);
        }
    }
}

class PacketUnpacker {
    structure: [type: string, key: string][];
    callback: Function;

    constructor(structure: [string, string][], callback: Function) {
        this.structure = structure;
        this.callback = callback;
    }

    unpack(packet: unknown[]) {
        const returnObject: { [key: string]: unknown } = {};
        for (let i = 0; i < packet.length; i++) {
            const packetElement = packet[i];
            const typeElement = this.structure[i];

            if (!(typeof packetElement === typeElement[0])) {
                break;
            }
            returnObject[typeElement[1]] = packetElement;
        }
        if (this.structure.every((item) => item[1] in returnObject)) {
            this.callback(returnObject);
        }
    }
}

interface Test {
    id: number;
    x: number;
    y: number;
}

function cool(data: Test) {
    console.log(data.id);
    console.log(data.x);
    console.log(data.y);
}

export const mainManager = new PacketManager();
const playerManager = new PacketManager();

const playerUnpacker = new PacketUnpacker(
    [
        ["string", "id"],
        ["number", "x"],
        ["number", "y"],
    ],
    cool
);

mainManager.addChild(0, playerManager);
playerManager.addChild(0, playerUnpacker);
