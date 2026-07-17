import { ServerPacket } from "@bundu/shared/packet_definitions";
import { Attributes } from "../components/attributes";
import { gameplayConfig } from "../configs/gameplay";
import type { GameObject } from "../engine/game_object.js";
import type { PlayerPacketManager } from "../engine/network/packets/manager";

const AMBIENT_SOURCE = "day_cycle";

/** Authoritative day/night clock — Leaderboard-style broadcast to connected players. */
export class DayCycle {
    private period = 0;
    private recipients = new Set<number>();

    /** Resolve period index from gameplay clock. */
    periodAt(gameTime: number): number {
        const { periods, totalDurationMs } = gameplayConfig().dayCycle;
        let remaining =
            ((gameTime % totalDurationMs) + totalDurationMs) % totalDurationMs;
        for (let i = 0; i < periods.length; i++) {
            const period = periods[i];
            if (!period) continue;
            remaining -= period.durationMs;
            if (remaining < 0) return i;
        }
        return periods.length - 1;
    }

    /** Snap internal period to gameTime without broadcasting. */
    syncClock(gameTime: number): void {
        this.period = this.periodAt(gameTime);
    }

    /** Apply current period ambient warmth to one player. */
    applyAmbient(player: GameObject): void {
        const attributes = Attributes.get(player);
        if (!attributes) return;
        const period = gameplayConfig().dayCycle.periods[this.period];
        if (!period) return;
        attributes.set(
            "temperature.warmth",
            AMBIENT_SOURCE,
            "add",
            period.ambientWarmth
        );
    }

    /** Send current period to a single player (join / reclaim). */
    syncPlayer(playerId: number, packets: PlayerPacketManager): void {
        packets.set(playerId, ServerPacket.SetTimeOfDay, { period: this.period });
        this.recipients.add(playerId);
    }

    /**
     * Advance from gameTime, broadcast on period change or to new joiners,
     * and refresh ambient warmth when the period flips.
     */
    update(
        gameTime: number,
        players: GameObject[],
        packets: PlayerPacketManager
    ): void {
        const next = this.periodAt(gameTime);
        const changed = next !== this.period;
        if (changed) this.period = next;

        const currentRecipients = new Set(players.map((player) => player.id));
        for (const player of players) {
            const isNew = !this.recipients.has(player.id);
            if (changed || isNew) {
                this.applyAmbient(player);
                packets.set(player.id, ServerPacket.SetTimeOfDay, {
                    period: this.period,
                });
            }
        }
        this.recipients = currentRecipients;
    }
}
