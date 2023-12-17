import { Player } from "./game_objects/player";
import { World } from "./world";

export class BunduServer {
    world: World;
    players: Map<number, Player>;
    constructor(world: World) {
        this.world = world;
        this.players = new Map();
    }
    publish(message: string) {}

    start() {
        setInterval(this.tick, 50);
    }

    tick() {
        this.world.tick();
    }
}
