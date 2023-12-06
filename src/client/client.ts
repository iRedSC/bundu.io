import { Viewport } from "pixi-viewport";
import { GameObjectHolder } from "./game_objects/object_list";

export class BunduClient {
    viewport: Viewport;
    objectHandler: GameObjectHolder;
    // socketHandler: SocketHandler;

    constructor(viewport: Viewport, objectHandler: GameObjectHolder) {
        this.viewport = viewport;
        // this.socketHandler = socketHandler;
        this.objectHandler = objectHandler;
    }
}
