import { PlayerData } from "../components/player.js";
import { ResourceConfig } from "../configs/resources.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";
import random from "../../lib/random.js";

function choice(arr: any[]) {
    return arr[random.integer(0, arr.length - 1)];
}

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
        const randomItem = choice(Array.from(config.items.keys()));
        this.trigger("giveItem", source.id, [[randomItem, 1]]);
    }
}
