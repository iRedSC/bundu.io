import { Attributes } from "../components/attributes.js";
import { Health } from "../components/base.js";
import { GameObject, System, type World } from "../engine";
import { emitVitals } from "../network/vitals.js";
import { GameEvent, type GameEventMap } from "./event_map.js";

/** Matches prior cadence: HealthSystem runs at 1 tps with a 5-tick period. */
const REGEN_INTERVAL_MS = 5000;

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

        if (time - health.lastRegen < REGEN_INTERVAL_MS) return;

        health.lastRegen = time;
        const regen = attributes.get("health.regen_amount");
        health.value = health.max
            ? Math.min(health.value + regen, health.max)
            : health.value + regen;
        emitVitals(object);
    }

    hurt({ object: target, source, damage }: GameEvent.Hurt) {
        const health = target.get(Health);
        const attributes = target.get(Attributes);
        let defense = attributes?.get("health.defense") ?? 0;

        damage = damage ?? 0;
        health.value -= Math.round(Math.max(0, damage - defense));
        if (health.value <= 0) {
            this.trigger(GameEvent.Kill, { object: target, source });
        }
        emitVitals(target);
    }
}
