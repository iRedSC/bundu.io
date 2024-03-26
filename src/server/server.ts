import { Player } from "./game_objects/player.js";
import { GameWS } from "./websockets.js";
import { World } from "./world.js";
import { ClientSchemas, PACKET_TYPE } from "../shared/enums.js";
import { Entity } from "./game_objects/entity.js";
import { PacketPipeline } from "../shared/unpack.js";
import { WorldObject } from "./game_objects/base.js";

function sendPacket(players: Iterable<Player>, packets: any[]) {
    for (let player of players) {
        for (let packet of packets) {
            player.socket.send(JSON.stringify(packet));
        }
    }
}

class UpdateList {
    entities: Map<number, Entity>;
    players: Map<number, Player>;
    generics: Map<number, WorldObject>;

    constructor() {
        this.clear();
    }

    clear() {
        this.entities = new Map();
        this.players = new Map();
        this.generics = new Map();
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
            packet.push(...player.pack("new"));
        }
        if (packet.length > 1) {
            player.socket.send(JSON.stringify(packet));
        }

        this.world.players.insert(player);
        console.log(`ID = ${player.id}`);
        this.players.set(player.id, player);
        for (let client of this.players.values()) {
            client.socket.send(
                JSON.stringify([PACKET_TYPE.NEW_PLAYER, ...player.pack("new")])
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
        sendPacket(this.players.values(), [[PACKET_TYPE.DELETE_OBJECT, id]]);
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
            this.updateList.players.set(id, player);
        }
    }

    receive(id: number, data: unknown[]) {
        // console.log(`Received: ${id}`);
        this.pipeline.unpack(data, id);
    }

    start() {
        setInterval(this.tick.bind(this), 50);
    }

    ping(_: unknown[], id: number) {
        const player = this.players.get(id);
        if (player) {
            console.log(`Pinging: ${id}`);
            player.socket.send(JSON.stringify([PACKET_TYPE.PING, Date.now()]));
        }
    }

    sendPackets() {
        const moveObject: [number, ...any[]] = [PACKET_TYPE.MOVE_OBJECT];
        const rotateObject: [number, ...any[]] = [PACKET_TYPE.ROTATE_OBJECT];
        for (const entity of this.updateList.entities.values()) {
            moveObject.push(...entity.pack(PACKET_TYPE.MOVE_OBJECT));
            rotateObject.push(...entity.pack(PACKET_TYPE.ROTATE_OBJECT));
        }
        for (const generic of this.updateList.generics.values()) {
            moveObject.push(...generic.pack(PACKET_TYPE.MOVE_OBJECT));
            rotateObject.push(...generic.pack(PACKET_TYPE.ROTATE_OBJECT));
        }
        for (const player of this.updateList.players.values()) {
            moveObject.push(...player.pack(PACKET_TYPE.MOVE_OBJECT));
            rotateObject.push(...player.pack(PACKET_TYPE.ROTATE_OBJECT));
        }
        this.updateList.clear();
        if (moveObject.length > 1) {
            sendPacket(this.players.values(), [moveObject, rotateObject]);
        }
    }

    tick() {
        this.world.tick(this.updateList);
        this.sendPackets();
    }
}
