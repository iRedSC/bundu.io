import { tileCenterWorld } from "@bundu/shared/tiles";
import {
    JOIN_RECLAIM_REJECTED,
    JOIN_USERNAME_TAKEN,
} from "@bundu/shared/session";
import {
    generateUsername,
    resolveUsername,
    usernamesEqual,
} from "@bundu/shared/username";
import { Circle, Vector } from "sat";
import type { World } from "../engine";
import { Player } from "../game_objects/player";
import { PlayerData } from "../components/player";
import { getVariantName } from "@bundu/shared/variant_map";

import { gameplayConfig } from "../configs/gameplay";

export {
    JOIN_RECLAIM_REJECTED as RECLAIM_REJECTED,
    JOIN_USERNAME_TAKEN as USERNAME_TAKEN,
};

type PlayerObjects = ReturnType<World["query"]>;

function isUsernameTaken(
    players: PlayerObjects,
    username: string,
    exceptId?: number
): boolean {
    return players.some(
        (object) =>
            object.active &&
            object.id !== exceptId &&
            usernamesEqual(object.get(PlayerData).name, username)
    );
}

/** Empty input → unique AdjectiveNoun; provided name → reject if taken. */
function claimUsername(
    players: PlayerObjects,
    raw: string,
    exceptId?: number
): string | typeof JOIN_USERNAME_TAKEN {
    const trimmed = raw.trim();
    if (trimmed) {
        const username = resolveUsername(trimmed);
        if (isUsernameTaken(players, username, exceptId)) {
            return JOIN_USERNAME_TAKEN;
        }
        return username;
    }

    for (let attempt = 0; attempt < 64; attempt++) {
        const username = generateUsername();
        if (!isUsernameTaken(players, username, exceptId)) {
            return username;
        }
    }

    for (let n = 2; n < 1000; n++) {
        const username = resolveUsername(`${generateUsername()}${n}`);
        if (!isUsernameTaken(players, username, exceptId)) {
            return username;
        }
    }

    return JOIN_USERNAME_TAKEN;
}

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
            return JOIN_RECLAIM_REJECTED;
        }
        const claimed = claimUsername(players, username, existing.id);
        if (claimed === JOIN_USERNAME_TAKEN) {
            return JOIN_USERNAME_TAKEN;
        }
        const data = existing.get(PlayerData);
        data.name = claimed;
        data.moveDir = [0, 0];
        data.attacking = false;
        data.blocking = false;
        console.log(
            `Reclaimed player ${existing.id} for session ${sessionId.slice(0, 8)}`
        );
        return existing.id;
    }

    const claimed = claimUsername(players, username);
    if (claimed === JOIN_USERNAME_TAKEN) {
        return JOIN_USERNAME_TAKEN;
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
            name: claimed,
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
