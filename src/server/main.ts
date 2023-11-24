import * as uWS from "uWebSockets.js";

const port = 7777;

const app = uWS.App({
    key_file_name: "misc/key.pem",
    cert_file_name: "misc/cert.pem",
    passphrase: "1234",
});

app.ws("/*", {
    /* Options */
    compression: uWS.SHARED_COMPRESSOR,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 10,
    /* Handlers */
    open: (ws) => {
        console.log("A WebSocket connected!");
        ws.subscribe("room");
    },
    message: (ws, message, isBinary) => {
        /* Ok is false if backpressure was built up, wait for drain */
        ws.publish("room", message, false);
        let ok = ws.send(message, isBinary);
    },
    drain: (ws) => {
        console.log("WebSocket backpressure: " + ws.getBufferedAmount());
    },
    close: (ws, code, message) => {
        console.log("WebSocket closed");
    },
});
app.any("/*", (res, req) => {
    res.end("Nothing to see here!");
});
app.listen(port, (token) => {
    if (token) {
        console.log("Listening to port " + port);
    } else {
        console.log("Failed to listen to port " + port);
    }
});
