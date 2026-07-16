import { tileCenterWorld } from "@bundu/shared/tiles";
import { ServerPacket } from "@bundu/shared/packet_definitions";
import { Circle, Vector } from "sat";
import type { World } from "../engine";
import { Player } from "../game_objects/player";
import { PlayerData } from "../components/player";
import { getVariantName } from "@bundu/shared/variant_map";

import { gameplayConfig } from "../configs/gameplay";

export function createPlayer(
    world: World,
    username: string,
    skinId: number,
    sessionId: string
): number {
    const players = world.query([PlayerData]);
    let restored = players.find(
        (object) => object.get(PlayerData).sessionId === sessionId
    );
    let matchedByName = false;
    if (!restored && process.env.BUNDU_DEBUG === "1") {
        const candidates = players.filter((object) => {
            const data = object.get(PlayerData);
            return (
                data.name === username &&
                world.context.socketManager.getSocket(object.id) === undefined
            );
        });
        if (candidates.length === 1) {
            restored = candidates[0];
            matchedByName = true;
        }
    }
    if (restored) {
        const data = restored.get(PlayerData);
        data.name = username;
        data.sessionId = sessionId;
        data.moveDir = [0, 0];
        data.attacking = false;
        data.blocking = false;
        restored.active = true;
        world.context.playerPacketManager.set(
            restored.id,
            ServerPacket.ClientConnectionInfo,
            { playerId: restored.id }
        );
        console.log(
            `[dev] reattached player ${restored.id} to session ${sessionId.slice(0, 8)}` +
                (matchedByName ? " (migrated by username)" : "")
        );
        return restored.id;
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

            moveDir: [0, 0],
            selectedStructure: {
                id: -1,
                rotation: 0,
                cursor: { x: tx, y: ty },
            },
        }
    );
    world.addObject(player);
    console.log(
        `Added player ${player.id} for session ${sessionId.slice(0, 8)}`
    );

    world.context.playerPacketManager.set(
        player.id,
        ServerPacket.ClientConnectionInfo,
        {
            playerId: player.id,
        }
    );
    return player.id;
}
