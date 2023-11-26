import * as uWS from "uWebSockets.js";
import { BunduServer } from "./game.js";

interface GameWS extends uWS.WebSocket<unknown> {
    id?: number;
}

function getIdWrapper() {
    let nextId = 0;
    function wrapper() {
        let id = nextId;
        nextId++;
        return id;
    }
    return wrapper;
}

const getId = getIdWrapper();

/* 
The server controller coordinates between the Websockets and the actual game logic.
It takes a game server as a property and will relay the messages sent by clients.
*/

const decoder = new TextDecoder("utf-8");

export class ServerController {
    webSocketServer: uWS.TemplatedApp;
    gameServer: BunduServer;
    sockets: Map<number, uWS.WebSocket<unknown>>;

    constructor(gameServer: BunduServer) {
        this.sockets = new Map();
        this.gameServer = gameServer;
        this.gameServer.publish = (message: string) => {
            for (let socket of this.sockets.values()) socket.send(message);
        };
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
                    ws.id = getId();
                    this.sockets.set(ws.id, ws);
                    ws.subscribe("public");
                    for (let message of this.gameServer.messages) {
                        ws.send(message);
                    }
                },
                message: (ws: GameWS, message, _isBinary) => {
                    if (ws.id === undefined) {
                        return;
                    }
                    this.gameServer.receiveMessage(
                        ws.id,
                        decoder.decode(message)
                    );
                },
                drain: (ws) => {
                    console.log(
                        "WebSocket backpressure: " + ws.getBufferedAmount()
                    );
                },
                close: (ws: GameWS, _code, _message) => {
                    if (ws.id !== undefined) {
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
