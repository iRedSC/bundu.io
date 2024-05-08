import { Attributes } from "../components/attributes.js";
import { Stats } from "../components/stats.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";
import { EventCallback } from "../game_engine/system.js";

export class HealthSystem extends System {
    tick: number;
    constructor() {
        super([Stats], 1);

        this.tick = 0;

        this.listen("hurt", this.hurt, [Stats]);
    }

    update(time: number, delta: number, object: GameObject) {
        const stats = object.get(Stats);
        const attributes = object.get(Attributes);
        if (!attributes) return;

        const health = stats.get("health");
        const regen = attributes.get("health.regen_amount");
        this.tick = (this.tick + 1) % 5;
        if (this.tick === 0) {
            const healthUpdate = health.max
                ? Math.min(health.value + regen, health.max)
                : health.value + regen;
            stats.set("health", { value: healthUpdate });
            this.trigger("health_update", object.id);
        }
    }

    hurt: EventCallback<"hurt"> = (object: GameObject, { source, damage }) => {
        const stats = object.get(Stats);
        const health = stats.get("health");
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
