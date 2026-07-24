import { PlayerData } from "../components/player.js";
import type { GameObject } from "../engine";

export type Capability = "gameplay" | "creative" | "admin" | "debug";

export function canUseCapability(
    player: GameObject,
    capability: Capability
): boolean {
    if (!player.active) return false;
    const data = PlayerData.get(player);
    if (!data) return false;

    const privileged =
        data.opLevel >= 4 || data.cheatsEnabled === true || serverDebugEnabled();
    switch (capability) {
        case "gameplay":
            return data.clientReady === true && data.freecam !== true;
        case "creative":
            return privileged;
        case "admin":
            return privileged && data.freecam === true;
        case "debug":
            return privileged;
    }
}

export function serverDebugEnabled(
    env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
    return env.BUNDU_DEBUG === "1";
}

export function assertProductionDebugPolicy(
    env: Readonly<Record<string, string | undefined>> = process.env
): void {
    if (env.NODE_ENV !== "production") return;
    if (serverDebugEnabled(env)) {
        throw new Error("BUNDU_DEBUG=1 is forbidden in production");
    }
    if (env.BUNDU_CHEAT_PHRASE) {
        throw new Error("BUNDU_CHEAT_PHRASE is forbidden in production");
    }
}
