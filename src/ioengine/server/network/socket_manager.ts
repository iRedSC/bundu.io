import { ReversableMap } from "@ioengine/server";
import { type ServerWebSocket } from "bun";

export class SocketManager {
    private map = new ReversableMap<ServerWebSocket<any>, number>();

    getSocket(playerId: number) {
        return this.map.getv(playerId);
    }

    getPlayerId(socket: ServerWebSocket<any>) {
        return this.map.get(socket);
    }

    addClient(socket: ServerWebSocket<any>, playerId: number) {
        this.map.set(socket, playerId);
    }

    deleteClient(value: ServerWebSocket<any> | number) {
        if (typeof value === "number") return this.map.deletev(value);
        this.map.delete(value);
    }
}
