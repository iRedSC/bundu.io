import { Player } from "./game_objects/player.js";
import { GameWS } from "./websockets.js";
import { World } from "./world.js";
import { ClientSchemas, PACKET_TYPE } from "../shared/enums.js";
import { Entity } from "./game_objects/entity.js";
import { PacketPipeline } from "../shared/unpack.js";

class UpdateList {
    entities: Map<number, Entity>;
    players: Map<number, Player>;

    constructor() {
        this.clear();
    }

    clear() {
        this.entities = new Map();
        this.players = new Map();
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
        const player = new Player(0, socket, [10_000, 10_000], 0, "");
        this.world.nextId++;
        player.id = this.world.nextId;
        player.name = `Player #${player.id}`;

        const packet: any[] = [PACKET_TYPE.NEW_PLAYER];
        for (const player of this.players.values()) {
            packet.push(...player.packNew());
        }
        if (packet.length > 1) {
            player.socket.send(JSON.stringify(packet));
        }

        this.world.players.insert(player);
        console.log(`ID = ${player.id}`);
        this.players.set(player.id, player);
        for (let client of this.players.values()) {
            client.socket.send(
                JSON.stringify([PACKET_TYPE.NEW_PLAYER, ...player.packNew()])
            );
        }
        player.socket.send(
            JSON.stringify([PACKET_TYPE.STARTING_INFO, player.id])
        );
        return player.id;
    }
    deletePlayer(id: number) {
        this.players.delete(id);
        this.world.players.delete(id);
    }
    moveUpdate(data: ClientSchemas.moveUpdate, id: number) {
        const player = this.players.get(id);
        if (player) {
            player.moveDir = [data[0], data[1]];
        }
    }
    rotatePlayer(data: ClientSchemas.rotate, id: number) {
        const player = this.players.get(id);
        if (player) {
            player.rotation = data[0];
        }
    }

    receive(id: number, data: unknown[]) {
        // console.log(`Received: ${id}`);
        this.pipeline.unpack(data, id);
    }

    start() {
        setInterval(this.tick.bind(this), 50);
        setInterval(this.sendPackets.bind(this), 50);
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
        for (const entity of this.updateList.entities.values()) {
            packet.push(...entity.pack());
        }
        for (const player of this.updateList.players.values()) {
            packet.push(...player.pack());
        }
        this.updateList.clear();
        for (const player of this.players.values()) {
            player.socket.send(JSON.stringify(packet));
        }
    }

    tick() {
        this.world.tick(this.updateList);
    }
}
