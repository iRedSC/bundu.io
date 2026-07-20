import {
    filterRegistryByOpLevel,
    parseCommand,
    type CommandArgProjection,
    type CommandProjection,
    type CommandRegistryProjection,
} from "@bundu/shared/command";
import { ServerPacket } from "@bundu/shared/packet_definitions";
import {
    AttributeList,
    Attributes,
    type AttributeType,
} from "../components/attributes.js";
import { Inventory } from "../components/inventory.js";
import { StatList, type StatType, Stats } from "../components/stats.js";
import { PlayerData } from "../components/player.js";
import type { GameObject } from "../engine";
import type { PlayerPacketManager } from "../engine/network/packets/manager.js";
import { gameRegistries } from "../configs/registries.js";
import { TIME_OF_DAY_NAMES } from "../network/day_cycle.js";
import { receiveItem } from "../network/inventory.js";
import { SERVER_DEBUG } from "./flag.js";

function resolveItemId(value?: string): number | undefined {
    if (!value) return undefined;
    try {
        return gameRegistries().item.resolve(value, "bundu");
    } catch {
        return undefined;
    }
}

const kits: Record<string, Record<string, number>> = {
    copper: {
        copper_pickaxe: 1,
        copper_sword: 1,
        copper_helmet: 1,
    },
    silver: {
        silver_pickaxe: 1,
        silver_sword: 1,
        silver_helmet: 1,
    },
    cobalt: {
        cobalt_pickaxe: 1,
        cobalt_sword: 1,
        cobalt_helmet: 1,
    },
    iridium: {
        iridium_sword: 1,
        iridium_wall: 10,
        iridium_door: 5,
        iridium_spike: 5,
    },
};

type ExecHelpers = {
    onKill: (player: GameObject) => void;
    now?: number;
    onSetTime?: (period: string) => boolean;
    onFreecam?: (player: GameObject) => void;
};

type ServerCommand = CommandProjection & {
    run: (
        player: GameObject,
        args: Record<string, string | number>,
        helpers: ExecHelpers
    ) => string;
};

export type CommandHandleResult = {
    /** Message was a slash command for an op player (success or failure). */
    handled: boolean;
    ok?: boolean;
    message?: string;
};

function arg(
    name: string,
    type: CommandArgProjection["type"],
    extra: Partial<CommandArgProjection> = {}
): CommandArgProjection {
    return { name, type, ...extra };
}

const COMMANDS: ServerCommand[] = [
    {
        name: "attribute",
        opLevel: 4,
        args: [
            arg("type", "enum", { values: AttributeList }),
            arg("operation", "enum", { values: ["add", "multiply"] }),
            arg("value", "float"),
            arg("duration", "float", { optional: true, min: 0 }),
        ],
        run(player, args, helpers) {
            const type = args.type as AttributeType;
            const operation = args.operation as "add" | "multiply";
            const value = Number(args.value);
            const duration =
                args.duration !== undefined ? Number(args.duration) : undefined;
            player
                .get(Attributes)
                .set(type, "command", operation, value, duration, helpers.now);
            return (
                `Set ${type} ${operation} ${value}` +
                (duration !== undefined ? ` for ${duration}ms` : "")
            );
        },
    },
    {
        name: "stat",
        opLevel: 4,
        args: [
            arg("type", "enum", { values: StatList }),
            arg("value", "float"),
        ],
        run(player, args) {
            const type = args.type as StatType;
            const value = Number(args.value);
            player.get(Stats).set(type, { value });
            return `Set ${type} to ${value}`;
        },
    },
    {
        name: "kill",
        opLevel: 4,
        args: [],
        run(player, _args, helpers) {
            helpers.onKill(player);
            return "Killed";
        },
    },
    {
        name: "godmode",
        opLevel: 4,
        args: [],
        run(player) {
            player
                .get(Attributes)
                .set("attack.speed", "godmode", "add", 100)
                .set("attack.reach", "godmode", "add", 500);
            return "Godmode enabled";
        },
    },
    {
        name: "give",
        opLevel: 4,
        args: [
            arg("item", "item"),
            arg("count", "integer", { optional: true, min: 1 }),
        ],
        run(player, args) {
            const item = String(args.item);
            const count = Number(args.count ?? 1);
            const numericId = resolveItemId(item);
            const inv = Inventory.get(player);
            if (numericId === undefined || !inv || !(count > 0)) {
                throw new Error(`Unknown item: ${item}`);
            }
            receiveItem(player, numericId, count);
            return `Gave ${count}× ${item}`;
        },
    },
    {
        name: "kit",
        opLevel: 4,
        args: [arg("kit", "enum", { values: Object.keys(kits) })],
        run(player, args) {
            const kitId = String(args.kit);
            const kit = kits[kitId];
            if (!kit) throw new Error(`Unknown kit: ${kitId}`);
            const inv = Inventory.get(player);
            if (!inv) throw new Error("No inventory");
            for (const [itemId, count] of Object.entries(kit)) {
                const numericId = resolveItemId(itemId);
                if (numericId !== undefined) receiveItem(player, numericId, count);
            }
            return `Gave kit ${kitId}`;
        },
    },
    {
        name: "settime",
        opLevel: 4,
        args: [arg("period", "enum", { values: TIME_OF_DAY_NAMES })],
        run(_player, args, helpers) {
            const period = String(args.period);
            if (!helpers.onSetTime) throw new Error("Time control unavailable");
            const ok = helpers.onSetTime(period);
            if (!ok) throw new Error(`Could not set time to ${period}`);
            return `Time set to ${period}`;
        },
    },
    {
        name: "freecam",
        opLevel: 4,
        args: [],
        run(player, _args, helpers) {
            helpers.onFreecam?.(player);
            const enabled = PlayerData.get(player)?.freecam === true;
            return enabled ? "Freecam enabled" : "Freecam disabled";
        },
    },
];

/** Full command registry (unfiltered). */
export function buildCommandRegistry(): CommandRegistryProjection {
    return {
        commands: COMMANDS.map(({ name, opLevel, args }) => ({
            name,
            opLevel,
            args,
        })),
    };
}

export function effectiveOpLevel(data: PlayerData | undefined): number {
    const level = data?.opLevel ?? 0;
    return SERVER_DEBUG ? Math.max(level, 4) : level;
}

export function emitCommandRegistry(
    playerId: number,
    opLevel: number,
    packets: PlayerPacketManager
): void {
    const filtered = filterRegistryByOpLevel(buildCommandRegistry(), opLevel);
    packets.set(playerId, ServerPacket.CommandRegistry, {
        commands: [...filtered.commands],
    });
}

export function emitCommandResult(
    playerId: number,
    message: string,
    ok: boolean,
    packets: PlayerPacketManager
): void {
    packets.add(playerId, ServerPacket.CommandResult, { message, ok });
}

/**
 * Debug/cheat slash commands. `handled` when the player is an op and the
 * message started with `/` (including parse failures).
 */
export function tryHandleDebugChatCommand(
    player: GameObject,
    message: string,
    helpers: ExecHelpers
): CommandHandleResult {
    if (!message.startsWith("/")) return { handled: false };

    const data = PlayerData.get(player);
    const opLevel = effectiveOpLevel(data);
    if (opLevel <= 0) return { handled: false };

    const registry = filterRegistryByOpLevel(buildCommandRegistry(), opLevel);
    const parsed = parseCommand(message, registry);
    if (!parsed.ok) {
        return { handled: true, ok: false, message: parsed.message };
    }

    const command = COMMANDS.find((entry) => entry.name === parsed.name);
    if (!command || command.opLevel > opLevel) {
        return {
            handled: true,
            ok: false,
            message: `Unknown command: /${parsed.name}`,
        };
    }

    try {
        const result = command.run(player, parsed.args, helpers);
        return { handled: true, ok: true, message: result };
    } catch (error) {
        const text =
            error instanceof Error ? error.message : "Command failed";
        return { handled: true, ok: false, message: text };
    }
}
