import type { StatBarsConfig } from "@bundu/shared/stat_bars";
import { parseStatBarsConfig } from "@bundu/shared/stat_bars";

let current: StatBarsConfig | undefined;

/** Apply pack-authored client stat bars (`assets/<ns>/stat_bars.yml`). */
export function applyStatBars(raw: unknown): StatBarsConfig {
    current = parseStatBarsConfig(raw);
    return current;
}

export function getStatBarsConfig(): StatBarsConfig {
    if (!current) {
        throw new Error("Stat bars config not loaded yet");
    }
    return current;
}
