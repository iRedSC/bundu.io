import { Attributes } from "../components/attributes.js";
import { Health, Rotting, Spiked, TileEntity } from "../components/base.js";
import { type GameObject, System, type World } from "../engine";
import { emitVitals } from "../network/vitals.js";
import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { gameplayConfig } from "../configs/gameplay.js";

export class HealthSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [Health], 1);

        this.listen(GameEvent.Hurt, this.hurt, [Health]);
    }

    override enter(object: GameObject) {
        object.get(Health).lastRegen = this.world.gameTime;
    }

    override update(time: number, _delta: number, object: GameObject) {
        const health = object.get(Health);
        const attributes = object.get(Attributes);
        if (!attributes) return;

        if (time - health.lastRegen < gameplayConfig().health.regenIntervalMs) return;

        health.lastRegen = time;
        const regen = attributes.get("health.regen_amount");
        health.value = health.max
            ? Math.min(health.value + regen, health.max)
            : health.value + regen;
        emitVitals(object, this.world.context.playerPacketManager);
    }

    hurt({ object: target, source, damage, hit }: GameEvent.Hurt) {
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
