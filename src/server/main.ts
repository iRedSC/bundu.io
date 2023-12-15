import { BunduServer } from "./game.js";
import { ServerController } from "./websockets.js";
import { resources } from "./configs/configs.js";
const thing = resources;

const bunduServer = new BunduServer();
const serverController = new ServerController(bunduServer);

serverController.start(7777);
