import { Health } from "../components/combat.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";
import { EventCallback } from "../game_engine/system.js";

export class HealthSystem extends System {
    tick: number;
    constructor() {
        super([Health], 1);

        this.tick = 0;

        this.listen("hurt", this.hurt, [Health]);
    }

    update(time: number, delta: number, object: GameObject) {
        const health = Health.get(object);
        this.tick = (this.tick + 1) % 5;
        if (this.tick === 0) {
            health.value = Math.min(health.value + 20, health.max);
            this.trigger("health_update", object.id);
        }
    }

    hurt: EventCallback<"hurt"> = (object: GameObject, { source, damage }) => {
        const health = Health.get(object);
        health.value -= damage || 0;
        if (health.value <= 0) {
            this.trigger("kill", object.id, { source });
        }
        this.trigger("health_update", object.id);
    };
}
