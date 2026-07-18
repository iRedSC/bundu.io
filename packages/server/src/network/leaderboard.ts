import { ServerPacket } from "@bundu/shared/packet_definitions";
import { PlayerData } from "../components/player";
import type { GameObject, World } from "../engine";
import type { PlayerPacketManager } from "../engine/network/packets/manager";
import { hidesFromLeaderboard } from "../systems/anon_occlusion";

const LEADERBOARD_SIZE = 10;

export class Leaderboard {
    private entriesKey = "";
    private recipients = new Set<number>();

    update(players: GameObject[], packets: PlayerPacketManager, world: World) {
        const entries = players
            .filter((player) => !hidesFromLeaderboard(player, world))
            .map((player) => {
                const { name, score } = player.get(PlayerData);
                return { id: player.id, name, score };
            })
            .sort((a, b) => b.score - a.score || a.id - b.id)
            .slice(0, LEADERBOARD_SIZE);
        const entriesKey = JSON.stringify(entries);
        const changed = entriesKey !== this.entriesKey;
        const currentRecipients = new Set(players.map((player) => player.id));

        for (const playerId of currentRecipients) {
            if (changed || !this.recipients.has(playerId)) {
                packets.set(playerId, ServerPacket.Leaderboard, { entries });
            }
        }

        this.entriesKey = entriesKey;
        this.recipients = currentRecipients;
    }
}
