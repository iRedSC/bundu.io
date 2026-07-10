import { random } from "@bundu/shared";
import {
    PLAYER_HITBOX_RADIUS,
    tileCenterWorld,
} from "@bundu/shared/tiles";
import { ServerPacket } from "@bundu/shared/packet_definitions";
import { Circle, Vector } from "sat";
import { serverTime, type World } from "../engine";
import { Player } from "../game_objects/player";

const SPAWN_TILE = 75;

export function createPlayer(
    world: World,
    username: string,
    skinId: number
): number {
    const tx = random.integer(SPAWN_TILE, SPAWN_TILE);
    const ty = random.integer(SPAWN_TILE, SPAWN_TILE);
    const position = new Vector(tileCenterWorld(tx), tileCenterWorld(ty));
    const collider = new Circle(position, PLAYER_HITBOX_RADIUS);

    const player = new Player(
        {
            position,
            collider,
            collisionRadius: PLAYER_HITBOX_RADIUS,
            solid: false,
            rotation: 0,
            speed: 10,
        },
        {
            name: username,
            score: 0,
            playerSkin: skinId,

            moveDir: [0, 0],
            selectedStructure: {
                id: -1,
                cooldown_timestamp: 0,
            },
        }
    );
    world.addObject(player);
    console.log("added player object");

    world.context.playerPacketManager.set(
        player.id,
        ServerPacket.ClientConnectionInfo,
        {
            playerId: player.id,
            serverStartTime: serverTime.start,
        }
    );
    console.log("Added client info packet");

    return player.id;
}
