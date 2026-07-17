import { ResourceData, Type } from "../components/base.js";
import { Inventory, tryAddItems } from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import { ItemConfigs } from "../configs/loaders/items.js";
import { evaluateLootTable } from "../configs/loaders/loot_tables.js";
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
        if (
            regenInterval <= 0 ||
            data.quantity >= data.maximumQuantity ||
            time - data.lastRegen < regenInterval
        ) {
            return;
        }
        data.quantity++;
        // Fixed loot indexes by harvestHit; regenerating stock must rewind the
        // cursor so restored capacity can drop again (mirrors old per-item stock).
        if (data.harvestHit > 0) data.harvestHit--;
        data.lastRegen = time;
    }

    private gather = ({ object: resource, source, hit }: GameEvent.Hurt) => {
        const report = (strength: number) => {
            if (hit) hit.strength = Math.min(10, Math.max(0, strength));
        };

        if (!source) {
            report(0);
            return;
        }

        const player = PlayerData.get(source);
        const inventory = Inventory.get(source);
        const type = Type.get(resource);
        if (!player || !inventory || !type) {
            report(0);
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
            report(0);
            return;
        }

        const amount = Math.max(
            0,
            Math.floor(
                config.level === -1
                    ? (multiplier ?? 1)
                    : (toolLevel - config.level + 1) * (multiplier ?? 1)
            )
        );
        if (amount === 0) {
            report(0);
            return;
        }

        const data = resource.get(ResourceData);
        let processed = 0;
        let inventoryChanged = false;
        while (processed < amount && data.quantity > 0) {
            const loot =
                data.lootTableId === null
                    ? new Map<number, number>()
                    : evaluateLootTable(
                          data.lootTableId,
                          data.lootSeed,
                          data.harvestHit
                      );
            // Empty fixed-loot miss (hit past table size) must not drain stock.
            if (loot.size === 0) break;
            if (!tryAddItems(inventory, loot)) break;
            inventoryChanged = true;
            data.quantity--;
            data.harvestHit++;
            processed++;
        }
        if (processed === 0) {
            report(0);
            return;
        }

        player.score += (config.score ?? 0) * processed;
        if (inventoryChanged) {
            emitInventory(source, this.world.context.playerPacketManager);
        }
        report(processed);
        if (config.destroy_on_empty && data.quantity === 0) this.remove(resource);
    };

    private remove(resource: GameObject) {
        if (!resource.active) return;
        resource.active = false;
        this.trigger(GameEvent.DeleteObject, { object: resource });
    }
}
