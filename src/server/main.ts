import * as uWS from "uWebSockets.js";

const port = 7777;

const app = uWS
    .App({
        key_file_name: "misc/key.pem",
        cert_file_name: "misc/cert.pem",
        passphrase: "1234",
    })
    .get("/*", (res, _) => {
        res.end("Hello World!");
    })
    .listen(port, (token) => {
        if (token) {
            console.log("Listening to port " + port);
        } else {
            console.log("Failed to listen to port " + port);
        }
    });

app;
