import { decode } from "@msgpack/msgpack";
import { SESSION_REJECTED_CLOSE } from "@bundu/shared/session";
import type { ServerWebSocket } from "bun";
import type { GameSocketData, SocketManager } from "./socket_manager";

type ValidPacket = [number, ...unknown[]];

function isValidPacket(value: unknown): value is ValidPacket {
    return Array.isArray(value) && Number.isSafeInteger(value[0]);
}

export class ServerController {
    connect: (socket: ServerWebSocket<GameSocketData>) => void = () => {};
    disconnect: (socket: ServerWebSocket<GameSocketData>) => void = () => {};
    message: (
        socket: ServerWebSocket<GameSocketData>,
        message: ValidPacket
    ) => void = () => {};
    createPlayer: (username: string, skinId: number, sessionId: string) => number;
    manager: SocketManager;
    requiredPackFingerprint: string | undefined;
    http: (request: Request, url: URL) => Response | undefined = () => undefined;

    constructor(
        manager: SocketManager,
        createPlayer: (username: string, skinId: number, sessionId: string) => number
    ) {
        this.createPlayer = createPlayer;
        this.manager = manager;
    }

    start(port: number) {
        const server = Bun.serve<GameSocketData>({
            port,
            fetch: (req, server) => {
                const url = new URL(req.url);
                const response = this.http(req, url);
                if (response) return response;
                if (
                    this.requiredPackFingerprint &&
                    url.searchParams.get("packs") !== this.requiredPackFingerprint
                ) {
                    return Response.json(
                        { error: "Resource pack mismatch" },
                        { status: 409 }
                    );
                }
                const username = url.searchParams.get("username") ?? "unnamed";
                const skin_id = Number(url.searchParams.get("skin_id")) || 0;
                const sessionId = url.searchParams.get("session_id") ?? crypto.randomUUID();

                const success = server.upgrade(req, {
                    data: {
                        playerId: -1,
                        username,
                        sessionId,
                        skinId: skin_id,
                    },
                });

                if (success) return;
                return new Response("Upgrade failed.", { status: 400 });
            },

            websocket: {
                open: (ws) => {
                    const playerId = this.createPlayer(
                        ws.data.username,
                        ws.data.skinId,
                        ws.data.sessionId
                    );
                    if (playerId < 0) {
                        ws.close(SESSION_REJECTED_CLOSE, "session in use");
                        return;
                    }
                    ws.data.playerId = playerId;
                    this.manager.addClient(ws, playerId);
                    this.connect(ws);
                    console.log(
                        `Socket connected: ${ws.data.username} ` +
                            `(session ${ws.data.sessionId.slice(0, 8)}, player ${playerId})`
                    );
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
