import { encode } from "@msgpack/msgpack";

export class SocketHandler {
    socket?: WebSocket;

    onopen?(): void;

    onmessage?(this: WebSocket, ev: MessageEvent<any>): void;

    constructor() {}

    send(message: Array<any>) {
        if (this.socket) {
            this.socket.send(encode(message));
            this.socket.onmessage;
        }
    }

    connect(socket: WebSocket) {
        this.socket = socket;
        if (this.onopen) {
            this.socket.onopen = this.onopen;
        }
        if (this.onmessage) {
            this.socket.onmessage = this.onmessage;
        }
    }
}
