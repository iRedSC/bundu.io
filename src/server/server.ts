import { Player } from "./game_objects/player.js";
import { GameWS } from "./websockets.js";
import { World } from "./world.js";
import { PACKET_TYPE } from "../shared/enums.js";
import { Entity } from "./game_objects/entity.js";

type UpdateList = {
    entities: Entity[];
};
export class BunduServer {
    world: World;
    players: Map<number, Player>;
    updateList: UpdateList;
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
        setInterval(this.tick.bind(this), 200);
        setInterval(this.sendPackets.bind(this), 200);
    }

    sendPackets() {
        const packet: [number, ...any[]] = [PACKET_TYPE.MOVE_OBJECT];
        for (const entity of this.updateList.entities) {
            packet.push(...entity.pack());
        }
        for (const player of this.players.values()) {
            player.socket.send(JSON.stringify(packet));
        }
    }

    tick() {
        this.updateList = this.world.tick();
        // if (this.updateList.entities.length > 0) {
        //     this.sendPackets();
        // }
    }
}
