import { BunduServer } from "./game.js";
import { ServerController } from "./websockets.js";
import { resourceConfig } from "./configs/configs.js";
const thing = resourceConfig;

const bunduServer = new BunduServer();
const serverController = new ServerController(bunduServer);

serverController.start(7777);
