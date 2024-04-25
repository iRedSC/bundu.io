import { ReversableMap } from "../../shared/reverseable_map.js";
import { WebSocket } from "uWebSockets.js";

export class SocketManager {
    sockets: ReversableMap<WebSocket<any>, number>;

    constructor() {
        this.sockets = new ReversableMap();
    }
}
