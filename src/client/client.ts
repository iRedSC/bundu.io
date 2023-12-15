// Main client class that handles all the goodness going on.

import { Viewport } from "pixi-viewport";
import { World } from "./game_objects/world";

export class BunduClient {
    viewport: Viewport;
    objectHandler: World;
    // socketHandler: SocketHandler;

    constructor(viewport: Viewport, objectHandler: World) {
        this.viewport = viewport;
        // this.socketHandler = socketHandler;
        this.objectHandler = objectHandler;
    }
}
