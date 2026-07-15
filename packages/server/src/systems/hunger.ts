import { Attributes } from "../components/attributes.js";
import { PlayerData } from "../components/player.js";
import { Stats } from "../components/stats.js";
import { type GameObject, System, type World } from "../engine";
import { emitVitals } from "../network/vitals.js";
import type { GameEventMap } from "./event_map.js";

const DRAIN_PER_MINUTE_MS = 60_000;
const MOVING_MULTIPLIER = 1.2;
const ATTACKING_MULTIPLIER = 1.1;

/** Drains hunger from the authoritative gameplay clock. */
export class HungerSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [PlayerData, Attributes, Stats], 1);
    }

    override update(_time: number, delta: number, player: GameObject): void {
        const data = player.get(PlayerData);
        const attributes = player.get(Attributes);
        const hunger = player.get(Stats).get("hunger");
        if (hunger.value <= 0) return;

        let multiplier = 1;
        if (data.moveDir[0] !== 0 || data.moveDir[1] !== 0) {
            multiplier *= MOVING_MULTIPLIER;
        }
        if (data.attacking) multiplier *= ATTACKING_MULTIPLIER;

        const amount =
            (attributes.get("hunger.depletion_amount") * multiplier * delta) /
            DRAIN_PER_MINUTE_MS;
        hunger.value = Math.max(0, hunger.value - amount);
        emitVitals(player, this.world.context.playerPacketManager);
    }
}
