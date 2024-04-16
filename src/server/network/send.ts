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
