import { decode } from "@msgpack/msgpack";
import { type ServerWebSocket } from "bun";
import type { SocketManager } from "./socket_manager";

type WebSocketData = { username: string; playerId: number };

type ValidPacket = [number, ...unknown[]];

function isValidPacket(value: unknown): value is ValidPacket {
    return Array.isArray(value) && typeof value[0] === "number";
}

export class ServerController {
    connect: (socket: ServerWebSocket<WebSocketData>) => void = () => {};
    disconnect: (socket: ServerWebSocket<WebSocketData>) => void = () => {};
    message: (
        socket: ServerWebSocket<WebSocketData>,
        message: ValidPacket
    ) => void = () => {};
    createPlayer: (username: string, skinId: number) => number;
    manager: SocketManager;

    constructor(
        manager: SocketManager,
        createPlayer: (username: string, skinId: number) => number
    ) {
        this.createPlayer = createPlayer;
        this.manager = manager;
    }

    start(port: number) {
        const server = Bun.serve<WebSocketData>({
            port,
            fetch: (req, server) => {
                const url = new URL(req.url);
                const username = url.searchParams.get("username") ?? "unnamed";
                const skin_id = Number(url.searchParams.get("skin_id")) || 0;
                const playerId = this.createPlayer(username, skin_id);

                const success = server.upgrade(req, {
                    data: { playerId, username },
                });

                if (success) return;
                return new Response("Upgrade failed.", { status: 400 });
            },

            websocket: {
                open: (ws) => {
                    this.manager.addClient(ws, ws.data.playerId);
                    this.connect(ws);
                    console.log(`Socket connected: ${ws.data.username}`);
                },

                message: (ws, message) => {
                    try {
                        if (typeof message === "string") return;
                        const decoded = decode(message);
                        if (!isValidPacket(decoded)) {
                            return console.error(
                                `Bad packet from ${ws.data.username} (${ws.data.playerId}): ${decoded}`
                            );
                        }
                        this.message(ws, decoded);
                    } catch {
                        console.warn("Invalid message format");
                    }
                },

                close: (ws, code) => {
                    this.disconnect(ws);
                    console.info(`Socket disconnected. Code: ${code}`);
                },
            },
        });

        console.log(`WebSocket server listening on :${server.port}`);
    }
}
