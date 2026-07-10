import { Attributes } from "../components/attributes.js";
import { Health } from "../components/base.js";
import { GameObject, System, type World } from "../engine";
import { GameEvent, type GameEventMap } from "./event_map.js";

export class HealthSystem extends System<GameEventMap> {
    tick: number;
    constructor(world: World) {
        super(world, [Health], 1);

        this.tick = 0;

        this.listen(GameEvent.Hurt, this.hurt, [Health]);
    }

    override update(time: number, delta: number, object: GameObject) {
        const health = object.get(Health);
        const attributes = object.get(Attributes);
        if (!attributes) return;

        const regen = attributes.get("health.regen_amount");
        this.tick = (this.tick + 1) % 5;
        if (this.tick === 0) {
            const healthUpdate = health.max
                ? Math.min(health.value + regen, health.max)
                : health.value + regen;
            health.value = healthUpdate;
            this.trigger(GameEvent.HealthUpdate, { object: object });
        }
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
        this.trigger(GameEvent.HealthUpdate, { object: target });
    }
}
