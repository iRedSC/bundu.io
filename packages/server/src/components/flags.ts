import { Component } from "../engine";

/**
 * Sourced flag grants (like attributes).
 * A flag is effective while at least one source still grants it.
 */
export class FlagsData {
    /** flagId → source ids currently granting it */
    private readonly sources = new Map<number, Set<string>>();
    /** sourceId → flag ids it currently grants */
    private readonly bySource = new Map<string, Set<number>>();

    has(flagId: number): boolean {
        const set = this.sources.get(flagId);
        return !!set && set.size > 0;
    }

    /** Snapshot of effective flag ids (sorted). */
    values(): number[] {
        const result: number[] = [];
        for (const [flagId, sources] of this.sources) {
            if (sources.size > 0) result.push(flagId);
        }
        return result.sort((a, b) => a - b);
    }

    /** True if the effective set changed. */
    add(flagId: number, sourceId: string): boolean {
        let flagSources = this.sources.get(flagId);
        if (!flagSources) {
            flagSources = new Set();
            this.sources.set(flagId, flagSources);
        }
        const wasEmpty = flagSources.size === 0;
        if (flagSources.has(sourceId)) return false;
        flagSources.add(sourceId);

        let granted = this.bySource.get(sourceId);
        if (!granted) {
            granted = new Set();
            this.bySource.set(sourceId, granted);
        }
        granted.add(flagId);
        return wasEmpty;
    }

    /** True if the effective set changed. */
    remove(flagId: number, sourceId: string): boolean {
        const flagSources = this.sources.get(flagId);
        if (!flagSources?.has(sourceId)) return false;
        flagSources.delete(sourceId);
        this.bySource.get(sourceId)?.delete(flagId);
        return flagSources.size === 0;
    }

    /** Drop every flag granted by `sourceId`. True if effective set changed. */
    clear(sourceId: string): boolean {
        const granted = this.bySource.get(sourceId);
        if (!granted || granted.size === 0) return false;
        let changed = false;
        for (const flagId of granted) {
            const flagSources = this.sources.get(flagId);
            if (!flagSources) continue;
            flagSources.delete(sourceId);
            if (flagSources.size === 0) changed = true;
        }
        this.bySource.delete(sourceId);
        return changed;
    }

    /** Replace all flags for `sourceId` with `flagIds`. True if effective set changed. */
    setSource(sourceId: string, flagIds: readonly number[]): boolean {
        let changed = this.clear(sourceId);
        for (const flagId of flagIds) {
            if (this.add(flagId, sourceId)) changed = true;
        }
        return changed;
    }
}

export const Flags = Component.register(() => new FlagsData());
