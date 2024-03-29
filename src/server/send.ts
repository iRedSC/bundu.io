import msgpack from "@msgpack/msgpack";

interface Socket {
    send(data: any, isBinary: boolean): void;
}

export function send(socket: Socket, data: any) {
    socket.send(Buffer.from(msgpack.encode(data)), true);
}
