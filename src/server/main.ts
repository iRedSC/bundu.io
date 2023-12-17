import { BunduServer } from "./server";
import { ServerController } from "./websockets";
import { World } from "./world";

const world = new World();
const bunduServer = new BunduServer(world);

bunduServer.start();

// const serverController = new ServerController(bunduServer);

// serverController.start(7777);
