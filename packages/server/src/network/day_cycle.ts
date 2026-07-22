import { ServerPacket } from "@bundu/shared/packet_definitions";
import { Attributes } from "../components/attributes";
import { gameplayConfig } from "../configs/gameplay";
import type { EffectAttribute } from "../configs/loaders/effect_context.js";
import { applyAttributes } from "../systems/effect_apply.js";
import type { GameObject } from "../engine/game_object.js";
import type { PlayerPacketManager } from "../engine/network/packets/manager";

const AMBIENT_SOURCE = "day_cycle";

export const TIME_OF_DAY_NAMES = [
    "morning",
    "day",
    "evening",
    "night",
] as const;
export type TimeOfDayName = (typeof TIME_OF_DAY_NAMES)[number];

export function isTimeOfDayName(value: string): value is TimeOfDayName {
    return (TIME_OF_DAY_NAMES as readonly string[]).includes(value);
}

/** Authoritative day/night clock — Leaderboard-style broadcast to connected players. */
export class DayCycle {
    private period = 0;
    /** Shifts gameplay clock so `/settime` can jump periods without freezing the cycle. */
    private offsetMs = 0;
    private recipients = new Set<number>();

    /** Current period index (0 = morning). */
    get periodIndex(): number {
        return this.period;
    }

    /** Current `/settime` period name. */
    get periodName(): TimeOfDayName {
        const name = gameplayConfig().dayCycle.periods[this.period]?.name;
        return name ?? "morning";
    }

    /** Resolve period index from gameplay clock. */
    periodAt(gameTime: number): number {
        const { periods, totalDurationMs } = gameplayConfig().dayCycle;
        let remaining =
            (((gameTime + this.offsetMs) % totalDurationMs) + totalDurationMs) %
            totalDurationMs;
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

    /**
     * Jump to the start of a named period and sync all connected players.
     * Cycle keeps advancing from there via {@link offsetMs}.
     */
    setPeriod(
        name: string,
        gameTime: number,
        players: GameObject[],
        packets: PlayerPacketManager
    ): boolean {
        if (!isTimeOfDayName(name)) return false;
        const { periods, totalDurationMs } = gameplayConfig().dayCycle;
        const index = periods.findIndex((period) => period.name === name);
        if (index < 0) return false;

        let startMs = 0;
        for (let i = 0; i < index; i++) {
            const period = periods[i];
            if (period) startMs += period.durationMs;
        }
        const progress =
            ((gameTime % totalDurationMs) + totalDurationMs) % totalDurationMs;
        this.offsetMs = startMs - progress;
        this.period = index;

        const currentRecipients = new Set<number>();
        for (const player of players) {
            this.applyAmbient(player);
            packets.set(player.id, ServerPacket.SetTimeOfDay, {
                period: this.period,
            });
            currentRecipients.add(player.id);
        }
        this.recipients = currentRecipients;
        return true;
    }

    /** Apply current period attribute modifiers to one player. */
    applyAmbient(player: GameObject): void {
        const attributes = Attributes.get(player);
        if (!attributes) return;
        const period = gameplayConfig().dayCycle.periods[this.period];
        if (!period) return;
        applyAttributes(
            attributes,
            AMBIENT_SOURCE,
            period.attributes as Record<string, EffectAttribute>
        );
    }

    /** Send current period to a single player (join / reclaim). */
    syncPlayer(playerId: number, packets: PlayerPacketManager): void {
        packets.set(playerId, ServerPacket.SetTimeOfDay, { period: this.period });
        this.recipients.add(playerId);
    }

    /**
     * Advance from gameTime, broadcast on period change or to new joiners,
     * and refresh ambient attributes when the period flips.
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
