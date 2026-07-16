import { random } from "@bundu/shared";
import { ResourceData, Type } from "../components/base.js";
import { addItem, Inventory } from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import { ItemConfigs } from "../configs/loaders/items.js";
import { ResourceConfigs } from "../configs/loaders/resources.js";
import { type GameObject, System, type World } from "../engine";
import { emitInventory } from "../network/inventory.js";
import { GameEvent, type GameEventMap } from "./event_map.js";

const UNARMED_HARVEST = { type: "pickaxe", level: 0 } as const;

export class ResourceSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [ResourceData], 1);
        this.listen(GameEvent.Hurt, this.gather, [ResourceData]);
    }

    override enter(resource: GameObject) {
        const data = resource.get(ResourceData);
        data.lastRegen = this.world.gameTime;
        const decay = ResourceConfigs.get(resource.get(Type).id).decay;
        if (decay !== null) data.decayAt = this.world.gameTime + decay * 1000;
    }

    override update(time: number, _delta: number, resource: GameObject) {
        const data = resource.get(ResourceData);
        const config = ResourceConfigs.get(resource.get(Type).id);

        if (data.decayAt !== null && time >= data.decayAt) {
            this.remove(resource);
            return;
        }

        const regenInterval = config.regen_speed * 1000;
        if (regenInterval <= 0 || time - data.lastRegen < regenInterval) return;

        const depleted = Object.entries(config.items).filter(
            ([itemId, maximum]) => (data.items[Number(itemId)] ?? 0) < maximum
        );
        if (depleted.length === 0) return;

        const itemId = Number(random.choice(depleted)[0]);
        data.items[itemId] = (data.items[itemId] ?? 0) + 1;
        data.lastRegen = time;
    }

    private gather = ({ object: resource, source, hit }: GameEvent.Hurt) => {
        const report = (success: boolean) => {
            if (hit) hit.success = success;
        };

        if (!source) {
            report(false);
            return;
        }

        const player = PlayerData.get(source);
        const inventory = Inventory.get(source);
        const type = Type.get(resource);
        if (!player || !inventory || !type) {
            report(false);
            return;
        }

        const config = ResourceConfigs.get(type.id);
        const tool =
            player.mainHand === undefined
                ? undefined
                : ItemConfigs.get(player.mainHand);
        const toolType = tool?.type ?? UNARMED_HARVEST.type;
        const toolLevel = tool?.level ?? UNARMED_HARVEST.level;
        const multiplier = config.multipliers[toolType];
        if (config.exclusive && multiplier === undefined) {
            report(false);
            return;
        }

        const amount = Math.max(
            0,
            Math.floor(
                config.level === -1
                    ? (multiplier ?? 1)
                    : (toolLevel - config.level + 1) *
                          (multiplier ?? 1)
            )
        );
        if (amount === 0) {
            report(false);
            return;
        }

        const data = resource.get(ResourceData);
        const available = Object.entries(data.items).filter(
            ([, remaining]) => remaining > 0
        );
        if (available.length === 0) {
            report(false);
            return;
        }

        const [itemKey, remaining] = random.choice(available);
        const itemId = Number(itemKey);
        const requested = Math.min(amount, remaining);
        const gathered = requested - addItem(inventory, itemId, requested);
        if (gathered === 0) {
            report(false);
            return;
        }

        data.items[itemId] = remaining - gathered;
        player.score += (config.score ?? 0) * gathered;
        emitInventory(source, this.world.context.playerPacketManager);
        report(true);

        if (
            config.destroy_on_empty &&
            Object.values(data.items).every((remaining) => remaining === 0)
        ) {
            this.remove(resource);
        }
    };

    private remove(resource: GameObject) {
        if (!resource.active) return;
        resource.active = false;
        this.trigger(GameEvent.DeleteObject, { object: resource });
    }
}
