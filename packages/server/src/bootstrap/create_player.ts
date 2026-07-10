import { random } from "@bundu/shared";
import { ServerPacket } from "@bundu/shared/packet_definitions";
import { Circle, Vector } from "sat";
import { serverTime, type World } from "../engine";
import { Player } from "../game_objects/player";

export function createPlayer(
    world: World,
    username: string,
    skinId: number
): number {
    const position = new Vector(
        random.integer(7500, 7500),
        random.integer(7500, 7500)
    );
    const collisionRadius = 30;
    const collider = new Circle(position, collisionRadius);

    const player = new Player(
        {
            position,
            collider,
            collisionRadius,
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
