import { encode } from "@msgpack/msgpack";

export class SocketHandler {
    socket?: WebSocket;

    private _onopen?(): void;

    private _onmessage?(this: WebSocket, ev: MessageEvent<any>): void;

    private _onclose?(this: WebSocket, ev: CloseEvent): void;

    constructor() {}

    send(message: Array<any>) {
        if (this.socket) {
            this.socket.send(encode(message));
        }
    }

    connect(socket: WebSocket) {
        this.socket = socket;
        if (this._onopen) {
            this.socket.onopen = this._onopen;
        }
        if (this._onmessage) {
            this.socket.onmessage = this._onmessage;
        }
        if (this._onclose) {
            this.socket.onclose = this._onclose;
        }
    }
    set onmessage(value: (this: WebSocket, ev: MessageEvent<any>) => void) {
        if (this.socket) {
            this.socket.onmessage = value;
        }
        this._onmessage = value;
    }

    set onopen(value: (this: WebSocket) => void) {
        if (this.socket) {
            this.socket.onopen = value;
        }
        this._onopen = value;
    }

    set onclose(value: (this: WebSocket, ev: CloseEvent) => void) {
        if (this.socket) {
            this.socket.onclose = value;
        }
        this._onclose = value;
    }
}
