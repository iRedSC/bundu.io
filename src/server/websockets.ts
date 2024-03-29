import * as uWS from "uWebSockets.js";
import { BunduServer } from "./server.js";
import Logger from "js-logger";
import { decode } from "@msgpack/msgpack";

const logger = Logger.get("Network");

export interface GameWS extends uWS.WebSocket<unknown> {
    id?: number;
}

/* 
The server controller coordinates between the Websockets and the actual game logic.
It takes a game server as a property and will relay the messages sent by clients.
*/
const decoder = new TextDecoder("utf-8");

export class ServerController {
    webSocketServer: uWS.TemplatedApp;
    gameServer: BunduServer;
    sockets: Map<number, GameWS>;
    connect: (socket: GameWS) => void;

    constructor(gameServer: BunduServer) {
        this.connect = (_: GameWS) => {};
        this.sockets = new Map();
        this.gameServer = gameServer;
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
                    ws.id = this.gameServer.createPlayer(ws);
                    this.sockets.set(ws.id, ws);
                    ws.subscribe("public");
                    this.connect(ws);
                    logger.info(`${ws.id} connected.`);
                },
                message: (ws: GameWS, message, _isBinary) => {
                    if (ws.id === undefined) {
                        return;
                    }
                    this.gameServer.receive(ws.id, decode(message));
                },
                drain: (ws) => {
                    logger.info(
                        "WebSocket backpressure: " + ws.getBufferedAmount()
                    );
                },
                close: (ws: GameWS, _code, _message) => {
                    if (ws.id !== undefined) {
                        this.gameServer.deletePlayer(ws.id);
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
