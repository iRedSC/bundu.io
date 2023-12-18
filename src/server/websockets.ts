import * as uWS from "uWebSockets.js";
import { BunduServer } from "./server.js";

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
                    console.log("A WebSocket connected!");
                    ws.id = this.gameServer.createPlayer(ws);
                    this.sockets.set(ws.id, ws);
                    ws.subscribe("public");
                    this.connect(ws);
                },
                message: (ws: GameWS, message, _isBinary) => {
                    if (ws.id === undefined) {
                        return;
                    }
                    this.gameServer.receive(
                        ws.id,
                        JSON.parse(decoder.decode(message))
                    );
                },
                drain: (ws) => {
                    console.log(
                        "WebSocket backpressure: " + ws.getBufferedAmount()
                    );
                },
                close: (ws: GameWS, _code, _message) => {
                    if (ws.id !== undefined) {
                        this.gameServer.deletePlayer(ws.id);
                        console.log(this.gameServer.players.get(ws.id));
                        this.sockets.delete(ws.id);
                    }
                    console.log("WebSocket closed");
                },
            })
            .any("/*", (res, _req) => {
                res.end("Nothing to see here!");
            });
    }

    start(port: number) {
        this.webSocketServer.listen(port, (token) => {
            if (token) {
                console.log("Listening to port " + port);
            } else {
                console.log("Failed to listen to port " + port);
            }
        });
    }
}
