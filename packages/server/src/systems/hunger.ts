import { Attributes } from "../components/attributes.js";
import { PlayerData } from "../components/player.js";
import { Stats } from "../components/stats.js";
import { type GameObject, System, type World } from "../engine";
import { emitVitals } from "../network/vitals.js";
import type { GameEventMap } from "./event_map.js";
import { gameplayConfig } from "../configs/gameplay.js";

/** Drains hunger from the authoritative gameplay clock. */
export class HungerSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [PlayerData, Attributes, Stats], 1);
    }

    override update(_time: number, delta: number, player: GameObject): void {
        // Soft-park: disconnected players do not drain hunger.
        if (!this.world.context.socketManager.getSocket(player.id)) return;
        if (PlayerData.get(player)?.freecam) return;

        const data = player.get(PlayerData);
        const attributes = player.get(Attributes);
        const hunger = player.get(Stats).get("hunger");
        if (hunger.value <= 0) return;
        const config = gameplayConfig().hunger;

        let multiplier = 1;
        if (data.moveDir[0] !== 0 || data.moveDir[1] !== 0) {
            multiplier *= config.movingMultiplier;
        }
        if (data.attacking) multiplier *= config.attackingMultiplier;

        const amount =
            (attributes.get("hunger.depletion_amount") * multiplier * delta) /
            config.drainPeriodMs;
        hunger.value = Math.max(0, hunger.value - amount);
        emitVitals(player, this.world.context.playerPacketManager);
    }
}
