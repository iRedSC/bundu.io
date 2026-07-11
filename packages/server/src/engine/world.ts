import { SERVER_TICK_MS } from "@bundu/shared";
import { GameObject } from "./game_object.js";
import { type AnySystem } from "./system.js";
import type { ComponentFactory } from "./component.js";
import type { ServerContext } from "./server_context.js";

/** Utility: check if all elements of subSet exist in superSet */
function isSubset<T>(subSet: Set<T>, superSet: Set<T>): boolean {
    for (const item of subSet) {
        if (!superSet.has(item)) return false;
    }
    return true;
}

/** Pull a GameObject from event payloads that carry an `object` field. */
function eventPayloadObject(data: unknown): GameObject | undefined {
    if (typeof data !== "object" || data === null) return undefined;
    if (!Object.prototype.hasOwnProperty.call(data, "object")) return undefined;
    const object = (data as { object?: unknown }).object;
    return object ? (object as GameObject) : undefined;
}

/**
 * ECS World — orchestrates GameObjects and Systems.
 *
 * Responsibilities:
 * - Keeps track of all entities (GameObjects)
 * - Maintains which systems apply to which objects
 * - Executes system update cycles
 * - Handles addition/removal and component changes cleanly
 */
export class World {
    // -------------------------------------------------------------------
    // Fields
    // -------------------------------------------------------------------
    public readonly objects = new Map<number, GameObject>();
    public readonly systems = new Map<number, AnySystem>();
    private readonly objectSystems = new Map<number, Set<AnySystem>>();

    /** Last gameTime each system ran its update (gameplay clock only). */
    private readonly systemLastUpdate = new Map<number, number>();

    private readonly subscriptions = new Map<number, () => void>();

    /** Authoritative gameplay clock (ms). Cooldowns, cadence, and expiry use this — not Date.now()/serverTime. */
    public gameTime = 0;

    /** Owned spatial index + net managers for this world instance. */
    public context!: ServerContext;

    // -------------------------------------------------------------------
    // Core: System Events
    // -------------------------------------------------------------------
    /** Dispatch an event to every system that listens for it. */
    dispatch(event: PropertyKey, data: unknown): void {
        const object = eventPayloadObject(data);

        for (const system of this.systems.values()) {
            const callbacks = system.callbacks?.get(event);
            if (!callbacks) continue;

            for (const [callback, requiredComponents] of callbacks) {
                if (!object || object.hasComponents?.(requiredComponents)) {
                    callback.call(system, data);
                }
            }
        }
    }

    // -------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------
    public destroy(): void {
        for (const unsubscribe of this.subscriptions.values()) unsubscribe();
        this.objects.clear();
        this.systems.clear();
        this.objectSystems.clear();
        this.subscriptions.clear();
        this.systemLastUpdate.clear();
    }

    // -------------------------------------------------------------------
    // Object Management
    // -------------------------------------------------------------------
    public getObject(id: number) {
        return this.objects.get(id);
    }

    public addObject(object: GameObject): this {
        if (!object || this.objects.has(object.id)) return this;

        this.objects.set(object.id, object);

        // Clean up any existing subscription and resubscribe
        this.subscriptions.get(object.id)?.();
        const unsubscribe = object.subscribe((obj) => {
            this.indexObject(obj);
        });
        this.subscriptions.set(object.id, unsubscribe);

        this.indexObject(object);
        return this;
    }

    public removeObject(object: GameObject): this {
        if (!object) return this;

        this.objects.delete(object.id);
        this.subscriptions.get(object.id)?.();
        this.subscriptions.delete(object.id);

        const systems = this.objectSystems.get(object.id);
        if (systems) {
            for (const system of systems) {
                system.exit?.call(system, object);
            }
        }

        this.objectSystems.delete(object.id);

        return this;
    }

    // -------------------------------------------------------------------
    // System Management
    // -------------------------------------------------------------------
    public addSystem(system: AnySystem): this {
        if (system.world !== this || this.systems.has(system.id)) {
            throw new Error("System already in use.");
        }

        this.systems.set(system.id, system);
        this.systemLastUpdate.set(system.id, this.gameTime);

        for (const object of this.objects.values()) {
            this.indexObject(object, system);
            if (
                object.active &&
                system.enter &&
                this.hasSystem(object, system)
            ) {
                system.enter(object);
            }
        }
        return this;
    }

    public removeSystem(system: AnySystem): this {
        if (!this.systems.has(system.id)) return this;

        this.systems.delete(system.id);
        this.systemLastUpdate.delete(system.id);

        for (const object of this.objects.values()) {
            if (system.exit && this.hasSystem(object, system)) {
                system.exit(object);
            }
            this.untrackObjectSystem(object, system);
        }

        return this;
    }

    // -------------------------------------------------------------------
    // Update Loop
    // -------------------------------------------------------------------
    /**
     * Advance gameplay by one fixed step and run each due system **once**.
     * No wall-clock catch-up: overruns make the world run slow instead of
     * collapsing 2–3 fixed moves into one latest-wins SetPosition.
     */
    public step(stepMs: number = SERVER_TICK_MS): void {
        this.gameTime += stepMs;

        const objectsBySystem = new Map<AnySystem, GameObject[]>();

        for (const [objectId, object] of this.objects.entries()) {
            if (!object.active) {
                this.removeObject(object);
                continue;
            }

            const systems = this.objectSystems.get(objectId);
            if (!systems) continue;

            for (const system of systems) {
                let objs = objectsBySystem.get(system);
                if (!objs) {
                    objs = [];
                    objectsBySystem.set(system, objs);
                }
                objs.push(object);
            }
        }

        for (const [system, objs] of objectsBySystem) {
            if (!system.update || system.tps <= 0) continue;

            const interval = 1000 / system.tps;
            const lastGT = this.systemLastUpdate.get(system.id) ?? 0;
            if (this.gameTime - lastGT < interval) continue;

            this.systemLastUpdate.set(system.id, lastGT + interval);
            for (const object of objs) {
                system.update(this.gameTime, interval, object);
            }
        }
    }

    /** Alias for {@link step} with the server tick interval. */
    public update(): void {
        this.step(SERVER_TICK_MS);
    }

    // -------------------------------------------------------------------
    // Queries
    // -------------------------------------------------------------------
    public query(
        components: readonly { readonly id: number }[],
        ids?: number[]
    ): GameObject[] {
        const targets = ids
            ? ids.map((id) => this.objects.get(id))
            : this.objects.values();
        const found: GameObject[] = [];

        for (const object of targets) {
            if (!object) continue;
            if (
                object.hasComponents(
                    components as ComponentFactory<unknown>[]
                )
            ) {
                found.push(object);
            }
        }
        return found;
    }

    // -------------------------------------------------------------------
    // Internal: Object ↔ System bookkeeping
    // -------------------------------------------------------------------
    /** Returns whether the given system currently applies to an object */
    private hasSystem(object: GameObject, system: AnySystem): boolean {
        return this.objectSystems.get(object.id)?.has(system) ?? false;
    }

    /** Remove all tracking state of system from object */
    private untrackObjectSystem(object: GameObject, system: AnySystem): void {
        this.objectSystems.get(object.id)?.delete(system);
    }

    /** Check and (re)index one object against all or one system */
    private indexObject(object: GameObject, single?: AnySystem): void {
        if (!this.objectSystems.has(object.id)) {
            this.objectSystems.set(object.id, new Set());
        }

        const systems = single ? [single] : this.systems.values();

        for (const system of systems) {
            const objectSystemSet = this.objectSystems.get(object.id)!;
            const componentSet = new Set(object.components.map((c) => c.id));
            const qualifies = isSubset(system.componentIds, componentSet);
            const already = objectSystemSet.has(system);

            if (qualifies && !already) {
                objectSystemSet.add(system);
                system.enter?.call(system, object);
            } else if (!qualifies && already) {
                system.exit?.call(system, object);
                this.untrackObjectSystem(object, system);
            }
        }
    }
}
