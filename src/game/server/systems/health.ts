import { Attributes } from "../components/attributes.js";
import { Health } from "../components/base.js";
import { GameObject, System } from "@ioengine/server";
import type { EventCallback, GameEventMap } from "./event_map.js";

export class HealthSystem extends System<GameEventMap> {
    tick: number;
    constructor() {
        super([Health], 1);

        this.tick = 0;

        this.listen("hurt", this.hurt, [Health]);
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
            this.trigger("health_update", object.id);
        }
    }

    hurt: EventCallback<"hurt"> = (object: GameObject, { source, damage }) => {
        const health = object.get(Health);
        const attributes = object.get(Attributes);
        let defense = attributes?.get("health.defense") ?? 0;

        damage = damage ?? 0;
        health.value -= Math.round(Math.max(0, damage - defense));
        if (health.value <= 0) {
            this.trigger("kill", object.id, { source });
        }
        this.trigger("health_update", object.id);
    };
}
