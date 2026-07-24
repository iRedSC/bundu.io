import {
    ClientPacketGuards,
    ClientSchema,
    type ClientPacketMap,
} from "@bundu/shared/packet_definitions";
import {
    decodeHello,
    encodeWelcome,
    PROTOCOL_VERSION,
    ProtocolCodec,
    Serializer,
    SUPPORTED_FEATURES,
    type ServerLimits,
} from "@bundu/shared";
import {
    JOIN_RECLAIM_REJECTED,
    SESSION_REJECTED_CLOSE,
} from "@bundu/shared/session";
import type { ServerWebSocket } from "bun";
import type { GameSocketData, SocketManager } from "./socket_manager";
import {
    redactCredential,
    WebSocketAdmissionPolicy,
} from "./websocket_admission";

export class ServerController {
    connect: (socket: ServerWebSocket<GameSocketData>) => void = () => {};
    disconnect: (socket: ServerWebSocket<GameSocketData>) => void = () => {};
    message: (
        socket: ServerWebSocket<GameSocketData>,
        message: [number, ...unknown[]]
    ) => void = () => {};
    createPlayer: (username: string, skinId: number, sessionId: string) => number;
    manager: SocketManager;
    requiredPackFingerprint: string | undefined;
    limits: ServerLimits = {
        maxFrameBytes: 64 * 1024,
        maxReliableQueue: 128,
        maxPacketsPerPlayerTick: 32,
        maxPacketsGlobalTick: 2_048,
    };
    http: (request: Request, url: URL) => Response | undefined = () => undefined;

    constructor(
        manager: SocketManager,
        createPlayer: (username: string, skinId: number, sessionId: string) => number
    ) {
        this.createPlayer = createPlayer;
        this.manager = manager;
    }

    start(port: number) {
        const allowedOrigins = process.env.WS_ALLOWED_ORIGINS?.split(",")
            .map((origin) => origin.trim())
            .filter(Boolean);
        const admission = new WebSocketAdmissionPolicy({
            environment: process.env.NODE_ENV,
            allowedOrigins:
                allowedOrigins && allowedOrigins.length > 0
                    ? allowedOrigins
                    : undefined,
            maxPayloadBytes: this.limits.maxFrameBytes,
        });
        const serializer = new Serializer<ClientPacketMap>(ClientSchema);
        const codec = new ProtocolCodec({
            maxFrameBytes: admission.maxPayloadBytes,
            maxPacketsPerFrame: 1,
        });
        const server = Bun.serve<GameSocketData>({
            port,
            fetch: (req, server) => {
                const url = new URL(req.url);
                const response = this.http(req, url);
                if (response) return response;

                const isWebsocketUpgrade =
                    req.headers.get("upgrade")?.toLowerCase() === "websocket";
                if (!isWebsocketUpgrade) {
                    return new Response("Not Found", { status: 404 });
                }
                const username = url.searchParams.get("username") ?? "";
                const skin_id = Number(url.searchParams.get("skin_id")) || 0;
                const sessionId = url.searchParams.get("session_id") ?? crypto.randomUUID();
                const inspected = admission.inspectUpgrade(req, sessionId);
                if (!inspected.ok) {
                    return Response.json(
                        { error: inspected.reason },
                        { status: inspected.status }
                    );
                }

                const success = server.upgrade(req, {
                    data: {
                        playerId: -1,
                        username,
                        sessionId,
                        skinId: skin_id,
                        negotiated: false,
                        invalidFrames: 0,
                    },
                });

                if (success) return;
                return new Response("Upgrade failed.", { status: 400 });
            },

            websocket: {
                open: (ws) => {
                    console.log(
                        `Socket awaiting Hello: ${ws.data.username} ` +
                            `(session ${redactCredential(ws.data.sessionId)})`
                    );
                },

                message: (ws, message) => {
                    if (typeof message === "string") {
                        ws.close(1003, "binary frames required");
                        return;
                    }
                    const payloadFailure = admission.inspectPayload(
                        message.byteLength
                    );
                    if (payloadFailure) {
                        ws.close(1009, payloadFailure.reason);
                        return;
                    }
                    if (!ws.data.negotiated) {
                        const packFingerprint = this.requiredPackFingerprint ?? "";
                        const hello = decodeHello(
                            message,
                            packFingerprint,
                            admission.maxPayloadBytes
                        );
                        if (!hello.ok) {
                            ws.close(1008, hello.error);
                            return;
                        }
                        const playerId = this.createPlayer(
                            ws.data.username,
                            ws.data.skinId,
                            ws.data.sessionId
                        );
                        if (playerId === JOIN_RECLAIM_REJECTED) {
                            ws.close(SESSION_REJECTED_CLOSE, "session in use");
                            return;
                        }
                        ws.data.playerId = playerId;
                        ws.data.negotiated = true;
                        this.manager.addClient(ws, playerId);
                        ws.send(
                            encodeWelcome(
                                {
                                    protocolVersion: PROTOCOL_VERSION,
                                    packFingerprint,
                                    limits: this.limits,
                                    features: [...SUPPORTED_FEATURES],
                                },
                                performance.now()
                            )
                        );
                        this.connect(ws);
                        console.log(
                            `Socket connected: ${ws.data.username} ` +
                                `(session ${redactCredential(ws.data.sessionId)}, player ${playerId})`
                        );
                        return;
                    }
                    const decoded = codec.decodeClientPacket(
                        message,
                        serializer,
                        ClientPacketGuards
                    );
                    if (!decoded.ok) {
                        ws.data.invalidFrames = Math.min(
                            ws.data.invalidFrames + 1,
                            1_000_000
                        );
                        if (ws.data.invalidFrames <= 5) {
                            console.warn(
                                `Dropped client frame for player ${ws.data.playerId}: ${decoded.error}`
                            );
                        }
                        return;
                    }
                    this.message(ws, decoded.serialized);
                },

                close: (ws, code) => {
                    if (ws.data.negotiated) this.disconnect(ws);
                    console.info(`Socket disconnected. Code: ${code}`);
                },
                maxPayloadLength: admission.maxPayloadBytes,
            },
        });

        console.log(`WebSocket server listening on :${server.port}`);
    }
}
