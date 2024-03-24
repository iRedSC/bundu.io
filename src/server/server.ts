import { Player } from "./game_objects/player.js";
import { GameWS } from "./websockets.js";
import { World } from "./world.js";
import { PACKET_TYPE } from "../shared/enums.js";
import { Entity } from "./game_objects/entity.js";
import { PacketPipeline } from "../shared/unpack.js";

class UpdateList {
    entities: Entity[];

    constructor() {
        this.entities = [];
    }
}
export class BunduServer {
    world: World;
    players: Map<number, Player>;
    updateList: UpdateList;
    pipeline: PacketPipeline;
    constructor(world: World, pipeline: PacketPipeline) {
        this.pipeline = pipeline;
        this.world = world;
        this.players = new Map();
        this.updateList = new UpdateList();
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
    moveUpdate(data: unknown[], id: number) {}

    receive(id: number, data: unknown[]) {
        console.log(`Received: ${id}`);
        this.pipeline.unpack(data, id);
    }

    start() {
        setInterval(this.tick.bind(this), 50);
        setInterval(this.sendPackets.bind(this), 200);
    }

    ping(_: unknown[], id: number) {
        const player = this.players.get(id);
        if (player) {
            console.log(`Pinging: ${id}`);
            player.socket.send(JSON.stringify([PACKET_TYPE.PING, Date.now()]));
        }
    }

    sendPackets() {
        const packet: [number, ...any[]] = [PACKET_TYPE.MOVE_OBJECT];
        for (const entity of this.updateList.entities) {
            packet.push(...entity.pack());
        }
        this.updateList.entities = [];
        for (const player of this.players.values()) {
            player.socket.send(JSON.stringify(packet));
        }
    }

    tick() {
        this.world.tick(this.updateList);
    }
}
