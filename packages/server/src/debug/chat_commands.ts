import {
    AttributeList,
    Attributes,
    type AttributeType,
} from "../components/attributes.js";
import { addItem, Inventory } from "../components/inventory.js";
import { StatList, type StatType, Stats } from "../components/stats.js";
import type { GameObject } from "../engine";
import { getNumericId } from "@bundu/shared/id_map.js";


const kits: Record<string, Record<string, number>> = {
    "gold": {
        "gold_pickaxe": 1,
        "gold_sword": 1,
        "gold_helmet": 1
    },
    "diamond": {
        "diamond_pickaxe": 1,
        "diamond_sword": 1,
        "diamond_helmet": 1
    }
}

/**
 * Debug/cheat slash commands (`/attribute`, `/stat`, `/kill`, `/godmode`, `/give`, `/settime`).
 * Only invoked after a player unlocks cheats with the configured phrase.
 * Returns true when the message was treated as a command (handled or rejected).
 */
export function tryHandleDebugChatCommand(
    player: GameObject,
    message: string,
    onKill: (player: GameObject) => void,
    now?: number,
    onSetTime?: (period: string) => boolean
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
        case "kit": {
            const kitId = command[1];
            if (kitId === undefined) return true;
            if (!kits[kitId]) return true;
            const kit = kits[kitId];
            const inv = Inventory.get(player);
            if (!inv) return true;
            for (const [itemId, count] of Object.entries(kit)) {
                const numericId = getNumericId(itemId);
                if (numericId !== undefined) addItem(inv, numericId, count);
            }
            break;
        }
        case "settime": {
            const period = command[1];
            if (!period || !onSetTime) return true;
            onSetTime(period);
            break;
        }
    }
    return true;
}
