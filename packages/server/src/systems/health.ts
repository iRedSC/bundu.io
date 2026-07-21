import {
    Attributes,
    type AttributesData,
} from "../components/attributes.js";
import { Health, Rotting, Spiked, TileEntity } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { Stats } from "../components/stats.js";
import { type GameObject, System, type World } from "../engine";
import { emitVitals } from "../network/vitals.js";
import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { HitFlash } from "@bundu/shared/hit_flash";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { gameplayConfig } from "../configs/gameplay.js";
import { isCreativeGodmode } from "../creative/mode.js";

export class HealthSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [Health], 1);

        this.listen(GameEvent.Hurt, this.hurt, [Health]);
    }

    override enter(object: GameObject) {
        object.get(Health).lastRegen = this.world.gameTime;
    }

    override update(time: number, _delta: number, object: GameObject) {
        if (PlayerData.get(object)?.freecam) return;
        if (isCreativeGodmode(object)) return;
        const health = object.get(Health);
        const attributes = object.get(Attributes);
        if (!attributes) return;

        if (time - health.lastRegen < gameplayConfig().health.regenIntervalMs) return;

        health.lastRegen = time;
        if (regenCancelled(object, attributes)) return;

        const naturalLimit = gameplayConfig().health.naturalLimit;
        if (health.value >= naturalLimit) return;

        const regen = attributes.get("health.regen_amount");
        if (regen <= 0) return;
        const before = health.value;
        const cap = health.max
            ? Math.min(health.max, naturalLimit)
            : naturalLimit;
        health.value = Math.min(health.value + regen, cap);
        if (health.value > before && PlayerData.get(object)) {
            this.world.context.worldPacketManager.emit(ServerPacket.HitEvent, {
                id: object.id,
                angle: 0,
                strength: 0,
                flash: HitFlash.Heal,
            });
        }
        emitVitals(object, this.world.context.playerPacketManager);
    }

    hurt({ object: target, source, damage, hit }: GameEvent.Hurt) {
        if (isCreativeGodmode(target)) return;
        const health = target.get(Health);
        const attributes = target.get(Attributes);
        const defense = attributes?.get("health.defense") ?? 0;

        damage = damage ?? 0;
        if (source && Rotting.get(target)) {
            damage *= gameplayConfig().health.rottingDamageMultiplier;
        }
        if (Spiked.get(target)) {
            damage *= gameplayConfig().spikes.damageMultiplierToSpike;
        }
        const applied = Math.round(Math.max(0, damage - defense));
        health.value -= applied;

        // Structures: strength = % of max health dealt this hit, clamped 0–10.
        if (hit && TileEntity.get(target)) {
            const percent =
                health.max > 0 ? (applied / health.max) * 100 : 0;
            hit.strength = Math.min(10, Math.max(0, percent));
        }

        if (health.value <= 0) {
            this.trigger(GameEvent.Kill, { object: target, source });
        }
        this.world.context.worldPacketManager.set(
            ServerPacket.UpdateObjectHealth,
            {
                id: target.id,
                health: Math.max(0, health.value),
                maxHealth: health.max,
            }
        );
        emitVitals(target, this.world.context.playerPacketManager);
    }
}

function regenCancelled(
    object: GameObject,
    attributes: AttributesData
): boolean {
    const stats = Stats.get(object);
    if (!stats) return false;

    const hunger = stats.get("hunger").value;
    if (hunger < attributes.get("hunger.cancel_regen_below")) return true;

    const temperature = stats.get("temperature").value;
    const tempBelow = attributes.get("temperature.cancel_regen_below");
    const tempAbove = attributes.get("temperature.cancel_regen_above");
    if (temperature < tempBelow) return true;
    if (tempAbove > 0 && temperature > tempAbove) return true;

    const thirst = stats.get("thirst").value;
    const thirstBelow = attributes.get("thirst.cancel_regen_below");
    const thirstAbove = attributes.get("thirst.cancel_regen_above");
    if (thirst < thirstBelow) return true;
    if (thirstAbove > 0 && thirst > thirstAbove) return true;

    const air = stats.get("air").value;
    if (air < attributes.get("air.cancel_regen_below")) return true;

    return false;
}
