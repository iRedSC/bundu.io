import { tileCenterWorld } from "@bundu/shared/tiles";
import { Circle, Vector } from "sat";
import type { World } from "../engine";
import { Player } from "../game_objects/player";
import { PlayerData } from "../components/player";
import { getVariantName } from "@bundu/shared/variant_map";

import { gameplayConfig } from "../configs/gameplay";

/** Negative ids are reclaim failures — caller must reject the socket. */
export const RECLAIM_REJECTED = -1;

export function createPlayer(
    world: World,
    username: string,
    skinId: number,
    sessionId: string
): number {
    const players = world.query([PlayerData]);
    const existing = players.find(
        (object) =>
            object.active && object.get(PlayerData).sessionId === sessionId
    );

    if (existing) {
        if (world.context.socketManager.getSocket(existing.id)) {
            return RECLAIM_REJECTED;
        }
        const data = existing.get(PlayerData);
        data.name = username;
        data.moveDir = [0, 0];
        data.attacking = false;
        data.blocking = false;
        console.log(
            `Reclaimed player ${existing.id} for session ${sessionId.slice(0, 8)}`
        );
        return existing.id;
    }

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
            sessionId,
            playerSkin: getVariantName(skinId) ?? "base",
            pendingSpawn: true,
            clientReady: false,
            opLevel: 0,

            moveDir: [0, 0],
            selectedStructure: {
                id: -1,
                itemId: -1,
                rotation: 0,
                cursor: { x: tx, y: ty },
            },
        }
    );
    world.addObject(player);
    console.log(
        `Added player ${player.id} for session ${sessionId.slice(0, 8)}`
    );
    return player.id;
}
