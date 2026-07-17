import {
    AttributeList,
    Attributes,
    type AttributeType,
} from "../components/attributes.js";
import { addItem, Inventory } from "../components/inventory.js";
import { StatList, type StatType, Stats } from "../components/stats.js";
import type { GameObject } from "../engine";
import { gameRegistries } from "../configs/registries.js";

function resolveItemId(value?: string): number | undefined {
    if (!value) return undefined;
    try {
        return gameRegistries().item.resolve(value, "bundu");
    } catch {
        return undefined;
    }
}

const kits: Record<string, Record<string, number>> = {
    "copper": {
        "copper_pickaxe": 1,
        "copper_sword": 1,
        "copper_helmet": 1
    },
    "silver": {
        "silver_pickaxe": 1,
        "silver_sword": 1,
        "silver_helmet": 1
    },
    "cobalt": {
        "cobalt_pickaxe": 1,
        "cobalt_sword": 1,
        "cobalt_helmet": 1
    },
    "iridium": {
        "iridium_sword": 1,
        "iridium_wall": 10,
        "iridium_door": 5,
        "iridium_spike": 5
    }
}

/**
 * Debug/cheat slash commands (`/attribute`, `/stat`, `/kill`, `/godmode`, `/give`).
 * Only invoked after a player unlocks cheats with the configured phrase.
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
            const numericId = resolveItemId(command[1]);
            const count = Number(command[2] ?? 1);
            const inv = Inventory.get(player);
            if (numericId === undefined || !inv || !(count > 0)) return true;
            addItem(inv, numericId, count);
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
                const numericId = resolveItemId(itemId);
                if (numericId !== undefined) addItem(inv, numericId, count);
            }
            break;
        }
    }
    return true;
}
