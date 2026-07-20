import { GroundItemData, Physics } from "../components/base.js";
import { Inventory } from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import { type GameObject, System, type World } from "../engine";
import {
    emitEquipment,
    emitInventory,
    receiveItem,
} from "../network/inventory.js";
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

            const remaining = receiveItem(player, data.itemId, data.amount);
            if (remaining === data.amount) continue;

            data.amount = remaining;
            const { playerPacketManager, worldPacketManager } =
                this.world.context;
            emitInventory(player, playerPacketManager);
            emitEquipment(player, worldPacketManager);
            if (remaining > 0) return;

            item.active = false;
            this.trigger(GameEvent.DeleteObject, { object: item });
            return;
        }
    }
}
