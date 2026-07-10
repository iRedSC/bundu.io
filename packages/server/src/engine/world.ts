import { GameObject } from "./game_object.js";
import { type AnySystem } from "./system.js";
import type { ComponentFactory } from "./component.js";

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

    private readonly objectLastUpdateRT = new Map<
        number,
        Map<number, number>
    >();
    private readonly objectLastUpdateGT = new Map<
        number,
        Map<number, number>
    >();

    private readonly subscriptions = new Map<number, () => void>();

    public timeScale = 1;
    public lastUpdate = performance.now();
    public gameTime = 0;

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
        this.objectLastUpdateGT.clear();
        this.objectLastUpdateRT.clear();
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
        this.objectLastUpdateGT.set(object.id, new Map());
        this.objectLastUpdateRT.set(object.id, new Map());

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
        this.objectLastUpdateGT.delete(object.id);
        this.objectLastUpdateRT.delete(object.id);

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
    public update(): void {
        const now = performance.now();

        // Update global game time using the scaled delta
        const delta = now - this.lastUpdate;
        this.gameTime += delta * this.timeScale;
        this.lastUpdate = now;

        for (const [objectId, object] of this.objects.entries()) {
            if (!object.active) {
                this.removeObject(object);
                continue;
            }

            const systems = this.objectSystems.get(objectId);
            if (!systems) continue;

            const lastRT = this.objectLastUpdateRT.get(objectId)!;
            const lastGT = this.objectLastUpdateGT.get(objectId)!;

            for (const system of systems) {
                if (!system.update || !system.tps || system.tps <= 0) continue;

                const interval = 1000 / system.tps;

                const lastSystemRT = lastRT.get(system.id) ?? 0;
                const lastSystemGT = lastGT.get(system.id) ?? 0;

                const elapsedRT = now - lastSystemRT;
                const elapsedGT = this.gameTime - lastSystemGT;

                // Only update the system if enough real time has passed
                if (elapsedRT < interval) continue;

                // Smoothly align the next update time (prevents drift)
                const newRT = now - (elapsedRT % interval);
                lastRT.set(system.id, newRT);
                lastGT.set(system.id, this.gameTime);

                system.update(this.gameTime, elapsedGT, object);
            }
        }
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
        this.objectLastUpdateGT.get(object.id)?.delete(system.id);
        this.objectLastUpdateRT.get(object.id)?.delete(system.id);
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
                this.objectLastUpdateGT
                    .get(object.id)!
                    .set(system.id, this.gameTime);
                this.objectLastUpdateRT.get(object.id)!.set(system.id, performance.now());
                system.enter?.call(system, object);
            } else if (!qualifies && already) {
                system.exit?.call(system, object);
                this.untrackObjectSystem(object, system);
            }
        }
    }
}
