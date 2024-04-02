import * as uWS from "uWebSockets.js";
import Logger from "js-logger";
import { decode } from "@msgpack/msgpack";
import { PacketPipeline } from "../../shared/unpack.js";

const logger = Logger.get("Network");

export interface GameWS extends uWS.WebSocket<unknown> {
    id?: number;
}

let NEXT_SOCKET_ID = 1;

/* 
The server controller coordinates between the Websockets and the actual game logic.
It takes a game server as a property and will relay the messages sent by clients.
*/
export class ServerController {
    webSocketServer: uWS.TemplatedApp;
    sockets: Map<number, GameWS>;
    connect: (socket: GameWS) => void = () => {};
    disconnect: (socket: GameWS) => void = () => {};
    message: (socket: GameWS, message: unknown) => void = () => {};

    constructor() {
        this.sockets = new Map();
        this.webSocketServer = uWS
            .App({
                key_file_name: "misc/key.pem",
                cert_file_name: "misc/cert.pem",
                passphrase: "1234",
            })
            .ws("/*", {
                /* Options */
                compression: uWS.SHARED_COMPRESSOR,
                maxPayloadLength: 16 * 1024,
                idleTimeout: 10,
                /* Handlers */
                open: (ws: GameWS) => {
                    ws.id = NEXT_SOCKET_ID++;
                    this.sockets.set(ws.id, ws);
                    ws.subscribe("public");
                    this.connect(ws);
                    logger.info(`${ws.id} connected.`);
                },
                message: (ws: GameWS, message, _isBinary) => {
                    if (ws.id === undefined) {
                        return;
                    }
                    this.message(ws, decode(message));
                },
                drain: (ws) => {
                    logger.info(
                        "WebSocket backpressure: " + ws.getBufferedAmount()
                    );
                },
                close: (ws: GameWS, _code, _message) => {
                    if (ws.id !== undefined) {
                        this.disconnect(ws);
                        this.sockets.delete(ws.id);
                    }
                    logger.info(`${ws.id} disconnected.`);
                },
            })
            .any("/*", (res, _req) => {
                res.end("Nothing to see here!");
            });
    }

    start(port: number) {
        this.webSocketServer.listen(port, (token) => {
            if (token) {
                logger.info("Listening to port " + port);
            } else {
                logger.info("Failed to listen to port " + port);
            }
        });
    }
}
