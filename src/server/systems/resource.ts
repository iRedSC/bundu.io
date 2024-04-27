import { PlayerData } from "../components/player.js";
import { ResourceConfigs } from "../configs/loaders/resources.js";
import { GameObject } from "../game_engine/game_object.js";
import { EventCallback, System } from "../game_engine/system.js";
import random from "../../lib/random.js";
import { ItemConfigs } from "../configs/loaders/items.js";
import { idMap } from "../configs/loaders/id_map.js";
import { Physics, ResourceData, Type } from "../components/base.js";

export class ResourceSystem extends System {
    constructor() {
        super([ResourceData], 1);

        this.listen("hurt", this.hit, [ResourceData]);
    }

    public update(time: number, delta: number, object: GameObject): void {
        const physics = Physics.get(object);
        const config = ResourceConfigs.get(object.get(Type)?.id);
        const resourceData = ResourceData.get(object);
        if (resourceData.decayAt)
            if (Date.now() > resourceData.decayAt) {
                this.trigger("kill", object.id);
                return;
            }

        if (Date.now() > resourceData.lastRegen + config.regen_speed * 1000) {
            const items = Array.from(Object.keys(resourceData.items)).map(
                (str) => parseInt(str)
            );
            const randomItem = random.choice(items);
            if (
                resourceData.items[randomItem] <
                config.items[randomItem] + Math.round(physics.size / 7)
            ) {
                resourceData.items[randomItem]++;
                resourceData.lastRegen = Date.now();
            }
        }
    }

    hit: EventCallback<"hurt"> = (object: GameObject, { source }) => {
        if (!source) return;

        const playerData = PlayerData.get(source);
        if (!playerData) return;
        const config = ResourceConfigs.get(object.get(Type)?.id);
        const resourceData = ResourceData.get(object);
        const tool = ItemConfigs.get(playerData.mainHand);
        const type = tool?.type ?? "pickaxe";
        const level = tool?.level || 0;
        const multipler = config.multipliers[type] ?? undefined;
        let amount = Math.floor((level - config.level + 1) * (multipler ?? 1));
        if (config.level === -1) amount = Math.floor(multipler ?? 1);

        if (config.exclusive && multipler === undefined) return;

        const items = Array.from(Object.keys(resourceData.items)).map((str) =>
            parseInt(str)
        );
        const randomItem = random.choice(items);
        amount =
            resourceData.items[randomItem] >= amount
                ? amount
                : resourceData.items[randomItem];
        resourceData.items[randomItem] = Math.max(
            0,
            resourceData.items[randomItem] - amount
        );
        this.trigger("give_item", source.id, { id: randomItem, amount });
    };
}
