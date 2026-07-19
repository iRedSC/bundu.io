import {
    parseCommand,
    type CommandRegistryProjection,
} from "@bundu/shared/command";
import { isDebugHitboxesVisible, setDebugHitboxesVisible } from "./overlay";

/** Client-only debug slash commands (never sent to the server). */
export const CLIENT_DEBUG_COMMANDS: CommandRegistryProjection = {
    commands: [
        {
            name: "debug",
            opLevel: 0,
            args: [
                {
                    name: "feature",
                    type: "enum",
                    values: ["hitboxes"],
                },
            ],
        },
    ],
};

export type ClientCommandResult = {
    ok: boolean;
    message: string;
};

/**
 * Handle a client-only debug command. Returns null when the message is not a
 * client debug command (caller should forward to the server).
 */
export function tryHandleClientDebugCommand(
    message: string
): ClientCommandResult | null {
    if (!message.startsWith("/")) return null;

    const name = message.slice(1).trimStart().split(/\s+/, 1)[0];
    if (name !== "debug") return null;

    const parsed = parseCommand(message, CLIENT_DEBUG_COMMANDS);
    if (!parsed.ok) {
        return { ok: false, message: parsed.message };
    }

    if (parsed.args.feature === "hitboxes") {
        const next = !isDebugHitboxesVisible();
        setDebugHitboxesVisible(next);
        return {
            ok: true,
            message: `Hitboxes ${next ? "enabled" : "disabled"}`,
        };
    }

    return { ok: false, message: "Unknown debug feature" };
}
