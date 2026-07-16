import { GroundItemData, Physics } from "../components/base.js";
import { addItem, Inventory } from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import { type GameObject, System, type World } from "../engine";
import { emitInventory } from "../network/inventory.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { gameplayConfig } from "../configs/gameplay.js";

/** Transfers nearby world stacks into player inventories. */
export class GroundItemSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [GroundItemData, Physics], 10);
    }

    override update(time: number, _delta: number, item: GameObject) {
        const data = item.get(GroundItemData);
        if (time < data.pickupAt) return;
        const position = item.get(Physics).position;
        const pickupRadius = gameplayConfig().items.pickupRadius;

        for (const player of this.world.query([PlayerData, Inventory, Physics])) {
            const playerPosition = player.get(Physics).position;
            const x = playerPosition.x - position.x;
            const y = playerPosition.y - position.y;
            if (x * x + y * y > pickupRadius * pickupRadius) continue;

            const inventory = player.get(Inventory);
            const remaining = addItem(inventory, data.itemId, data.amount);
            if (remaining === data.amount) continue;

            data.amount = remaining;
            emitInventory(player, this.world.context.playerPacketManager);
            if (remaining > 0) return;

            item.active = false;
            this.trigger(GameEvent.DeleteObject, { object: item });
            return;
        }
    }
}
