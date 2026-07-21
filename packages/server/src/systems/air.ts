import { Attributes } from "../components/attributes.js";
import { PlayerData } from "../components/player.js";
import { Stats } from "../components/stats.js";
import { type GameObject, System, type World } from "../engine";
import { emitVitals } from "../network/vitals.js";
import type { GameEventMap } from "./event_map.js";
import { gameplayConfig } from "../configs/gameplay.js";
import { applyVitalsTickDamage } from "./vitals_damage.js";
import { HitFlash } from "@bundu/shared/hit_flash";
import { takeVitalsTicks } from "./vitals_tick.js";
import { isGodmode } from "../creative/mode.js";

/**
 * Applies air.oxygen once every vitals.tick_period_ms while submerged.
 * Non-negative oxygen instantly refills to max (surface).
 */
export class AirSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [PlayerData, Attributes, Stats], 0.2);
    }

    override update(_time: number, delta: number, player: GameObject): void {
        // Soft-disconnected bodies still drown/refill — survival continues until reclaim or death.
        if (PlayerData.get(player)?.freecam) return;
        if (isGodmode(player)) return;

        const attributes = player.get(Attributes);
        const stats = player.get(Stats);
        const air = stats.get("air");
        const before = air.value;
        const max = air.max ?? attributes.get("air.max");
        const oxygen = attributes.get("air.oxygen");

        if (oxygen >= 0) {
            if (before !== max) {
                stats.set("air", { value: max });
            }
        } else {
            const ticks = takeVitalsTicks(
                player.id,
                "air",
                delta,
                gameplayConfig().vitals.tickPeriodMs
            );
            if (ticks > 0) {
                if (before > 0) {
                    stats.set("air", {
                        value: Math.max(0, before + oxygen * ticks),
                    });
                } else {
                    applyVitalsTickDamage(
                        this.world,
                        player,
                        gameplayConfig().air.drownDamage,
                        ticks,
                        HitFlash.Drown
                    );
                }
            }
        }

        if (air.value !== before) {
            emitVitals(player, this.world.context.playerPacketManager);
        }
    }
}
