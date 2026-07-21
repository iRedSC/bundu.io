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

/** Applies hunger.nourishment once every vitals.tick_period_ms. */
export class HungerSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [PlayerData, Attributes, Stats], 0.2);
    }

    override update(_time: number, delta: number, player: GameObject): void {
        // Soft-disconnected bodies still drain — survival continues until reclaim or death.
        if (PlayerData.get(player)?.freecam) return;
        if (isGodmode(player)) return;

        const data = player.get(PlayerData);
        const attributes = player.get(Attributes);
        const stats = player.get(Stats);
        const hunger = stats.get("hunger");
        const config = gameplayConfig().hunger;
        const before = hunger.value;
        const max = hunger.max ?? attributes.get("hunger.max");

        const ticks = takeVitalsTicks(
            player.id,
            "hunger",
            delta,
            gameplayConfig().vitals.tickPeriodMs
        );
        if (ticks > 0) {
            let multiplier = 1;
            if (data.moveDir[0] !== 0 || data.moveDir[1] !== 0) {
                multiplier *= config.movingMultiplier;
            }
            if (data.attacking) multiplier *= config.attackingMultiplier;

            const amount =
                attributes.get("hunger.nourishment") * multiplier * ticks;
            if (amount !== 0) {
                stats.set("hunger", {
                    value: Math.min(max, Math.max(0, before + amount)),
                });
            }

            // Damage only on ticks while already empty — not the tick that hits 0.
            if (before <= 0) {
                applyVitalsTickDamage(
                    this.world,
                    player,
                    config.starvationDamage,
                    ticks,
                    HitFlash.Starve
                );
            }
        }

        if (hunger.value !== before) {
            emitVitals(player, this.world.context.playerPacketManager);
        }
    }
}
