/** Dynamic flag name → id map, built while loading packs. */
export class FlagRegistry {
    private readonly ids = new Map<string, number>();
    private readonly names = new Map<number, string>();

    clear(): void {
        this.ids.clear();
        this.names.clear();
    }

    /** Register (or return existing) id for a flag name. */
    register(name: string, path: string): number {
        if (!name || typeof name !== "string") {
            throw new Error(`${path}: expected a non-empty flag name`);
        }
        const existing = this.ids.get(name);
        if (existing !== undefined) return existing;
        const id = this.ids.size + 1;
        this.ids.set(name, id);
        this.names.set(id, name);
        return id;
    }

    resolve(name: string, path: string): number {
        const id = this.ids.get(name);
        if (id === undefined) {
            throw new Error(`${path}: unknown flag "${name}"`);
        }
        return id;
    }

    name(id: number): string | undefined {
        return this.names.get(id);
    }

    has(name: string): boolean {
        return this.ids.has(name);
    }

    /** name → id for the client registry projection. */
    toProjection(): Record<string, number> {
        return Object.fromEntries(this.ids.entries());
    }

    get size(): number {
        return this.ids.size;
    }
}

let current: FlagRegistry | undefined;

export function resetFlagRegistry(): FlagRegistry {
    current = new FlagRegistry();
    return current;
}

export function flagRegistry(): FlagRegistry {
    if (!current) throw new Error("Flag registry has not been loaded");
    return current;
}
