import { pointToTile } from "@bundu/shared/tiles";
import { HitFlash } from "@bundu/shared/hit_flash";
import { Attributes } from "../components/attributes.js";
import { Physics } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { Stats } from "../components/stats.js";
import { GroundTypeConfigs } from "../configs/loaders/ground_types.js";
import { type GameObject, System, type World } from "../engine";
import { emitVitals } from "../network/vitals.js";
import type { GameEventMap } from "./event_map.js";
import { gameplayConfig } from "../configs/gameplay.js";
import { topGroundAt } from "./ground_at.js";
import { applyVitalsTickDamage } from "./vitals_damage.js";
import { takeVitalsTicks } from "./vitals_tick.js";

/**
 * Applies temperature.warmth once every vitals.tick_period_ms
 * (scaled by insulation toward zero).
 */
export class TemperatureSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [PlayerData, Attributes, Stats, Physics], 0.2);
    }

    override update(_time: number, delta: number, player: GameObject): void {
        // Soft-park: disconnected players do not drift temperature.
        if (!this.world.context.socketManager.getSocket(player.id)) return;
        if (PlayerData.get(player)?.freecam) return;

        const attributes = player.get(Attributes);
        const stats = player.get(Stats);
        const temperature = stats.get("temperature");
        const config = gameplayConfig().temperature;
        const before = temperature.value;
        const max = temperature.max ?? attributes.get("temperature.max");

        const ticks = takeVitalsTicks(
            player.id,
            "temperature",
            delta,
            gameplayConfig().vitals.tickPeriodMs
        );
        if (ticks > 0) {
            const warmth = attributes.get("temperature.warmth");
            const insulation = Math.min(
                1,
                Math.max(0, attributes.get("temperature.insulation"))
            );
            const effective = warmth * (1 - insulation);
            if (effective !== 0) {
                stats.set("temperature", {
                    value: before + effective * ticks,
                });
            }

            // Damage only on ticks while already at the extreme.
            if (before <= 0) {
                applyVitalsTickDamage(
                    this.world,
                    player,
                    config.freezeDamage,
                    ticks,
                    HitFlash.Freeze
                );
            } else if (before >= max && onOverheatGround(this.world, player)) {
                applyVitalsTickDamage(
                    this.world,
                    player,
                    config.overheatDamage,
                    ticks,
                    HitFlash.Overheat
                );
            }
        }

        if (temperature.value !== before) {
            emitVitals(player, this.world.context.playerPacketManager);
        }
    }
}

function onOverheatGround(world: World, player: GameObject): boolean {
    const physics = Physics.get(player);
    if (!physics) return false;
    const tile = pointToTile(physics.position);
    const top = topGroundAt(world, tile.x, tile.y);
    if (!top) return false;
    return GroundTypeConfigs.get(top.type).overheat;
}
