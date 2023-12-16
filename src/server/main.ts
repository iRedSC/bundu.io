import { BunduServer } from "./game.js";
import { ServerController } from "./websockets.js";
import { resourceConfigs } from "./configs/configs.js";
const thing = resourceConfigs;

const bunduServer = new BunduServer();
const serverController = new ServerController(bunduServer);

serverController.start(7777);
