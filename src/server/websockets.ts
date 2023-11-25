import * as uWS from "uWebSockets.js";
import { BunduServer } from "./game.js";

interface GameWS extends uWS.WebSocket<any> {
    id?: number;
}

const sockets = new Map();

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

export class ServerController {
    webSocketServer: uWS.TemplatedApp;
    gameServer: BunduServer;

    constructor(gameServer: BunduServer) {
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
                    ws.id = getId();
                    sockets.set(ws.id, ws);
                    console.log("A WebSocket connected!");
                    ws.subscribe("public");
                },
                message: (ws: GameWS, message, _isBinary) => {
                    if (ws.id === undefined) {
                        return;
                    }
                    // for (let socket of sockets.values()) socket.send(message);
                    ws.publish("public", message, _isBinary);
                    this.gameServer.receiveMessage(ws.id, message);
                },
                drain: (ws) => {
                    console.log(
                        "WebSocket backpressure: " + ws.getBufferedAmount()
                    );
                },
                close: (_ws, _code, _message) => {
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
