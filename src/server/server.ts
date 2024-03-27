import { Player } from "./game_objects/player.js";
import { GameWS } from "./websockets.js";
import { World, collisionBounds } from "./world.js";
import { CLIENT_ACTION, ClientSchemas, PACKET_TYPE } from "../shared/enums.js";
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

// updateList is the items that have been updated and need
// sent to clients.
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

// This is where most of the player handling logic happens
// creating, deleting, etc.
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
            packet.push(...player.pack(PACKET_TYPE.NEW_PLAYER));
        }
        if (packet.length > 1) {
            player.socket.send(JSON.stringify(packet));
        }

        this.world.players.insert(player);
        console.log(`ID = ${player.id}`);
        this.players.set(player.id, player);
        for (let client of this.players.values()) {
            client.socket.send(
                JSON.stringify([
                    PACKET_TYPE.NEW_PLAYER,
                    ...player.pack(PACKET_TYPE.NEW_PLAYER),
                ])
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
            const detectionRange = collisionBounds(player.position);
            const players = this.world.players.query(detectionRange);
            players.forEach((other) => {
                other.updateHandler.rotate.push(player);
            });
        }
    }

    playerAction(data: ClientSchemas.action, id: number) {
        const player = this.players.get(id);
        if (player) {
            let action = 0;
            switch (data[0]) {
                case CLIENT_ACTION.START_ATTACK:
                    player.attacking = 1;
                    action = 1;
                    this.world.attack(player);
                    break;
                case CLIENT_ACTION.STOP_ATTACK:
                    player.attacking = 0;
                    break;
                case CLIENT_ACTION.START_BLOCK:
                    player.attacking = 2;
                    action = 2;
                    break;
                case CLIENT_ACTION.STOP_BLOCK:
                    player.attacking = 0;
                    action = 3;
                    break;
            }
            sendPacket(this.players.values(), [
                [PACKET_TYPE.ACTION, id, action],
            ]);
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
            player.socket.send(JSON.stringify([PACKET_TYPE.PING, Date.now()]));
        }
    }

    sendPackets() {
        for (let player of this.players.values()) {
            player.updateHandler.send(player.socket);
            player.updateHandler.clear();
        }
    }

    tick() {
        this.world.tick(this.updateList);
        this.sendPackets();
    }
}
