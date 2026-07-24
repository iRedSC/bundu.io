import { ReversableMap } from "@bundu/shared";
import type { ServerWebSocket } from "bun";

export type GameSocketData = {
    username: string;
    sessionId: string;
    playerId: number;
    skinId: number;
    negotiated: boolean;
    invalidFrames: number;
};

export class SocketManager {
    private map = new ReversableMap<ServerWebSocket<GameSocketData>, number>();

    getSocket(playerId: number) {
        return this.map.getv(playerId);
    }

    getPlayerId(socket: ServerWebSocket<GameSocketData>) {
        return this.map.get(socket);
    }

    addClient(socket: ServerWebSocket<GameSocketData>, playerId: number) {
        this.map.set(socket, playerId);
    }

    deleteClient(value: ServerWebSocket<GameSocketData> | number) {
        if (typeof value === "number") return this.map.deletev(value);
        this.map.delete(value);
    }
}
