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

/** Applies thirst.hydration once every vitals.tick_period_ms. */
export class ThirstSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [PlayerData, Attributes, Stats], 0.2);
    }

    override update(_time: number, delta: number, player: GameObject): void {
        // Soft-disconnected bodies still drain — survival continues until reclaim or death.
        if (PlayerData.get(player)?.freecam) return;

        const attributes = player.get(Attributes);
        const stats = player.get(Stats);
        const thirst = stats.get("thirst");
        const before = thirst.value;
        const max = thirst.max ?? attributes.get("thirst.max") ?? 100;

        const ticks = takeVitalsTicks(
            player.id,
            "thirst",
            delta,
            gameplayConfig().vitals.tickPeriodMs
        );
        if (ticks > 0) {
            const amount = attributes.get("thirst.hydration") * ticks;
            if (amount !== 0) {
                stats.set("thirst", {
                    value: Math.min(max, Math.max(0, before + amount)),
                    max,
                });
            }

            if (before <= 0) {
                applyVitalsTickDamage(
                    this.world,
                    player,
                    gameplayConfig().thirst.dehydrationDamage,
                    ticks,
                    HitFlash.Dehydrate
                );
            }
        }

        if (thirst.value !== before) {
            emitVitals(player, this.world.context.playerPacketManager);
        }
    }
}
