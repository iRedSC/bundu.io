import { Attributes } from "../components/attributes.js";
import { PlayerData } from "../components/player.js";
import { Stats } from "../components/stats.js";
import { type GameObject, System, type World } from "../engine";
import { emitVitals } from "../network/vitals.js";
import type { GameEventMap } from "./event_map.js";
import { gameplayConfig } from "../configs/gameplay.js";

/**
 * Applies temperature.warmth each tick, scaled by insulation toward zero.
 * Insulation 1 freezes the stat; negative warmth cools.
 */
export class TemperatureSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [PlayerData, Attributes, Stats], 1);
    }

    override update(_time: number, delta: number, player: GameObject): void {
        // Soft-park: disconnected players do not drift temperature.
        if (!this.world.context.socketManager.getSocket(player.id)) return;

        const attributes = player.get(Attributes);
        const stats = player.get(Stats);
        const temperature = stats.get("temperature");
        const warmth = attributes.get("temperature.warmth");
        const insulation = Math.min(
            1,
            Math.max(0, attributes.get("temperature.insulation"))
        );
        const effective = warmth * (1 - insulation);
        if (effective === 0) return;

        const amount =
            (effective * delta) / gameplayConfig().temperature.tickPeriodMs;
        const before = temperature.value;
        stats.set("temperature", { value: before + amount });
        if (temperature.value === before) return;

        emitVitals(player, this.world.context.playerPacketManager);
    }
}
