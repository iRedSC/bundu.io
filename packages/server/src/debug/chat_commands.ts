import {
    AttributeList,
    Attributes,
    type AttributeType,
} from "../components/attributes.js";
import { addItem, Inventory } from "../components/inventory.js";
import { StatList, type StatType, Stats } from "../components/stats.js";
import type { GameObject } from "../engine";
import { getNumericId } from "@bundu/shared/id_map.js";

/**
 * Debug/cheat slash commands (`/attribute`, `/stat`, `/kill`, `/godmode`, `/give`).
 * Only invoked when SERVER_DEBUG is on.
 * Returns true when the message was treated as a command (handled or rejected).
 */
export function tryHandleDebugChatCommand(
    player: GameObject,
    message: string,
    onKill: (player: GameObject) => void,
    now?: number
): boolean {
    if (!message.startsWith("/")) return false;

    const command = message.replace("/", "").split(" ");

    switch (command[0]) {
        case "attribute": {
            if (!command[1]) return true;
            const type = command[1] as AttributeType;
            if (!AttributeList.includes(type)) return true;
            const operation = command[2] as "add" | "multiply";
            if (!["add", "multiply"].includes(operation)) return true;
            const value = Number(command[3]);
            let duration: number | undefined;
            if (command[4]) duration = Number(command[4]);
            player
                .get(Attributes)
                .set(type, "command", operation, value, duration, now);
            break;
        }
        case "stat": {
            if (!command[1]) return true;
            const type = command[1] as StatType;
            if (!StatList.includes(type)) return true;
            const value = Number(command[2]);
            player.get(Stats).set(type, { value });
            break;
        }
        case "kill": {
            onKill(player);
            break;
        }
        case "godmode": {
            player
                .get(Attributes)
                .set("attack.speed", "godmode", "add", 100)
                .set("attack.reach", "godmode", "add", 500);
            break;
        }
        case "give": {
            const itemId = getNumericId(command[1]);
            const count = Number(command[2] ?? 1);
            const inv = Inventory.get(player);
            if (itemId === undefined || !inv || !(count > 0)) return true;
            addItem(inv, itemId, count);
            break;
        }
    }
    return true;
}
