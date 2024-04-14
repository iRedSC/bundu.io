import { PlayerData } from "../components/player.js";
import { ResourceConfig } from "../configs/loaders/resources.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";
import random from "../../lib/random.js";
import { itemConfigs } from "../configs/loaders/load.js";

export class ResourceSystem extends System {
    constructor() {
        super([ResourceConfig]);

        this.listen("hurt", this.hit.bind(this));
    }

    hit(object: GameObject, { source }: { source: GameObject }) {
        const data = PlayerData.get(source)?.data;
        const config = ResourceConfig.get(object)?.data;
        if (!(data && config)) {
            return;
        }
        const tool = itemConfigs.get(data.mainHand || -1)?.data;
        const type = tool?.type || "pickaxe";
        const level = tool?.level || 0;
        const multipler = config.multipliers.get(type);
        let amount = Math.floor((level - config.level + 1) * (multipler || 1));
        if (config.level === -1) {
            amount = Math.floor(multipler || 1);
        }

        if (config.exclusive && multipler === undefined) {
            return;
        }

        const randomItem = random.choice(Array.from(config.items.keys()));
        this.trigger("give_items", source.id, [[randomItem, amount]]);
    }
}
