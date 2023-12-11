const packetExample: Packet = [
    0,
    [
        [1, 2, 3, 4, 5],
        [1, 2, 3, 4, 5, 5],
    ],
];

type Packet = [number, unknown[][]];
class PacketManager {
    children: Map<number, PacketManager>;

    constructor() {
        this.children = new Map();
    }

    addChild(id: number, manager: PacketManager) {
        this.children.set(id, manager);
    }

    unpack(packet: Packet) {
        const type = packet[0];
        const child = this.children.get(type);
        if (child) {
            child.unpackList(packet[1]);
        }
    }

    unpackList(packet: unknown[][]) {
        for (const ele of packet) {
            if (typeof ele[0] === "number" && Array.isArray(ele[1])) {
                this.unpack(ele as Packet);
            }
        }
    }
}

type Class<T> = { new (): T; prototype: T };
class PacketThing<T> {
    structure: [type: string, key: string][];
    type: Class<T>;
    callback: Function;

    constructor(
        structure: [string, string][],
        type: Class<T>,
        callback: Function
    ) {
        this.structure = structure;
        this.type = type;
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
        if (
            Object.keys(this.type).every((item) =>
                returnObject.hasOwnProperty(item)
            )
        ) {
            this.callback(returnObject);
        }
    }
}

// const test = new PacketThing([
//     ["number", "id"],
//     ["number", "x"],
//     ["number", "y"],
// ]);
