import { WebSocket } from "uWebSockets.js";

// A client is responsible for holding all the data associated with a websocket,
// such as its ID.
class Client {
    id: number;
    socket: WebSocket<any>;

    constructor(id: number, socket: WebSocket<any>) {
        this.id = id;
        this.socket = socket;
    }
}

export class ClientManager {
    readonly _next_id: number;
    clients: Map<number, Client>;

    constructor() {
        this._next_id = 0;
        this.clients = new Map();
    }

    create(socket: WebSocket<any>) {
        const client = new Client(this._next_id, socket);
        this.clients.set(client.id, client);
    }
}
