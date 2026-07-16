import { tileCenterWorld } from "@bundu/shared/tiles";
import { ServerPacket } from "@bundu/shared/packet_definitions";
import { Circle, Vector } from "sat";
import type { World } from "../engine";
import { Player } from "../game_objects/player";
import { getVariantName } from "@bundu/shared/variant_map";

import { gameplayConfig } from "../configs/gameplay";

export function createPlayer(
    world: World,
    username: string,
    skinId: number
): number {
    const config = gameplayConfig().player;
    const tx = config.spawnTile.x;
    const ty = config.spawnTile.y;
    const position = new Vector(tileCenterWorld(tx), tileCenterWorld(ty));
    const collider = new Circle(position, config.collisionRadius);

    const player = new Player(
        {
            position,
            collider,
            collisionRadius: config.collisionRadius,
            rotation: 0,
            speed: config.physicsSpeed,
        },
        {
            name: username,
            score: 0,
            playerSkin: getVariantName(skinId) ?? "base",

            moveDir: [0, 0],
            selectedStructure: {
                id: -1,
                rotation: 0,
                cursor: { x: tx, y: ty },
            },
        }
    );
    world.addObject(player);
    console.log(`Added player ${player.id}`);

    world.context.playerPacketManager.set(
        player.id,
        ServerPacket.ClientConnectionInfo,
        {
            playerId: player.id,
        }
    );
    return player.id;
}
