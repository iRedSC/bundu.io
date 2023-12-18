import { Player } from "./game_objects/player.js";
import { GameWS } from "./websockets.js";
import { World } from "./world.js";
import { PACKET_TYPE } from "../shared/enums.js";
let tickthing = false;
export class BunduServer {
    world: World;
    players: Map<number, Player>;
    constructor(world: World) {
        this.world = world;
        this.players = new Map();
    }

    createPlayer(socket: GameWS) {
        const player = new Player(0, socket, [10_000, 10_000], 0, "test");
        player.id = this.world.nextId;
        this.world.nextId++;
        this.world.players.insert(player);
        this.players.set(player.id, player);
        return player.id;
    }
    deletePlayer(id: number) {
        this.players.delete(id);
        this.world.players.delete(id);
    }

    receive(id: number, data: unknown) {}

    start() {
        setInterval(this.tick.bind(this), 50);
        setInterval(this.sendPackets.bind(this), 200);
    }

    sendPackets() {
        const packet: [number, number, any[]] = [
            PACKET_TYPE.MOVE_OBJECT,
            Date.now() + 200,
            [],
        ];
        for (const entity of this.world.entities.objects.values()) {
            packet[2].push(entity.pack());
        }
        for (const player of this.players.values()) {
            player.socket.send(JSON.stringify(packet));
        }
    }

    tick() {
        this.world.tick();
    }
}
