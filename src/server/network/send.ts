import * as msgpack from "@msgpack/msgpack";

interface Socket {
    send(data: any, isBinary: boolean): void;
}

export function send(socket: Socket, data: any) {
    try {
        socket.send(Buffer.from(msgpack.encode(data)), true);
        return true;
    } catch {
        return false;
    }
}

type PacketCallback = () => unknown;
type PacketPath = {
    children: { [key: number]: PacketPath };
    packets: PacketCallback[];
};

function getPacketPath(id: number, map: Map<number, PacketPath>) {
    if (!map.has(id)) {
        map.set(id, { children: {}, packets: [] });
    }
    return map.get(id)!;
}

export class PacketFactory {
    players: Map<number, PacketPath>;

    constructor() {
        this.players = new Map();
    }

    add(player: number, packetPath: number[], callback: PacketCallback): void {
        let path = getPacketPath(player, this.players);

        for (const [index, id] of packetPath.entries()) {
            if (!path.children[id]) {
                path.children[id] = { children: {}, packets: [] };
            }

            path = path.children[id];

            if (index === packetPath.length - 1) {
                path.packets.push(callback);
                return;
            }
        }
    }

    pack(player: number, path?: PacketPath, key?: string): unknown[] {
        if (path === undefined) {
            path = getPacketPath(player, this.players);
        }

        const packet: any[] = [];
        if (key) {
            packet.push(Number(key));

            if (path.packets.length > 0) {
                packet.push(...path.packets.map((fn) => fn()));
            }
        }

        for (const [key, child] of Object.entries(path.children)) {
            packet.push(this.pack(player, child, key));
        }
        return packet;
    }

    clear() {
        this.players.clear();
    }
}
