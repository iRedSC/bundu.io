import {
    WebSocket,
    TemplatedApp,
    App,
    SHARED_COMPRESSOR,
} from "uWebSockets.js";
import Logger from "js-logger";
import { decode } from "@msgpack/msgpack";
import { GlobalSocketManager } from "../globals.js";

const logger = Logger.get("Network");

/* 
The server controller coordinates between the Websockets and the actual game logic.
It takes a game server as a property and will relay the messages sent by clients.
*/
export class ServerController {
    webSocketServer: TemplatedApp;
    sockets: Map<number, WebSocket<any>>;
    connect: (socket: WebSocket<any>) => void = () => {};
    disconnect: (socket: WebSocket<any>) => void = () => {};
    message: (socket: WebSocket<any>, message: unknown) => void = () => {};

    constructor() {
        this.webSocketServer = App({
            key_file_name: "misc/key.pem",
            cert_file_name: "misc/cert.pem",
            passphrase: "1234",
        })
            .ws("/*", {
                /* Options */
                compression: SHARED_COMPRESSOR,
                maxPayloadLength: 16 * 1024,
                idleTimeout: 10,
                /* Handlers */
                open: (ws: WebSocket<any>) => {
                    ws.subscribe("public");
                    this.connect(ws);
                    logger.info(`Socket connected.`);
                },
                message: (ws: WebSocket<any>, message, _isBinary) => {
                    this.message(ws, decode(message));
                },
                drain: (ws) => {
                    logger.info(
                        "WebSocket backpressure: " + ws.getBufferedAmount()
                    );
                },
                close: (ws: WebSocket<any>, _code, _message) => {
                    this.disconnect(ws);
                    GlobalSocketManager.sockets.delete(ws);
                    logger.info(`Socket disconnected.`);
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
