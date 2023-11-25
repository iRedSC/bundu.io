import { BunduServer } from "./game.js";
import { ServerController } from "./websockets.js";

const bunduServer = new BunduServer();
const serverController = new ServerController(bunduServer);

serverController.start(7777);
