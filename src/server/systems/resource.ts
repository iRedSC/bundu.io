import { PlayerData } from "../components/player.js";
import { ResourceConfig } from "../configs/resources.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";

export class ResourceSystem extends System {
    constructor() {
        super([ResourceConfig]);

        this.listen("hurt", this.hit.bind(this));
    }

    hit(object: GameObject, source: GameObject) {
        const data = PlayerData.get(source)?.data;
        const config = ResourceConfig.get(object)?.data;
        if (!(data && config)) {
            return;
        }
        console.log("Resource hit" + config.item, config.amount);
        this.trigger("giveItem", source.id, [[config.item, config.amount]]);
    }
}
