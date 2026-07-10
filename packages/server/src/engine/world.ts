import { GameObject } from "./game_object.js";
import { System, type SystemEventCallback } from "./system.js";
import { Component, type ComponentFactory } from "./component.js";
import { NOW } from "./now.js";

/** Utility: check if all elements of subSet exist in superSet */
function isSubset<T>(subSet: Set<T>, superSet: Set<T>): boolean {
    for (const item of subSet) {
        if (!superSet.has(item)) return false;
    }
    return true;
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
    public readonly systems = new Map<number, System<any>>();
    private readonly objectSystems = new Map<number, Set<System<any>>>();

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
    public lastUpdate = NOW();
    public gameTime = 0;

    // -------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------
    constructor(systems?: System<any>[]) {
        systems?.forEach((system) => this.addSystem(system));
    }

    // -------------------------------------------------------------------
    // Core: System Events
    // -------------------------------------------------------------------
    private triggerSystems(event: number, data: Record<any, any>) {
        const object =
            Object.prototype.hasOwnProperty.call(data, "object") && data.object
                ? (data.object as GameObject)
                : undefined;

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
        const unsubscribe = object.subscribe((obj, added, removed) => {
            this.onObjectComponentChange(obj, added, removed);
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
    public addSystem(system: System<any>): this {
        if (system.world) throw new Error("System already in use.");

        this.inject(system);
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

    public removeSystem(system: System<any>): this {
        if (!this.systems.has(system.id)) return this;

        this.systems.delete(system.id);

        for (const object of this.objects.values()) {
            if (system.exit && this.hasSystem(object, system)) {
                system.exit(object);
            }
            this.untrackObjectSystem(object, system);
        }

        if (system.world === this) {
            system.world = undefined as any;
            system.trigger = undefined as any;
        }

        return this;
    }

    // -------------------------------------------------------------------
    // Update Loop
    // -------------------------------------------------------------------
    public update(): void {
        const now = NOW();

        // Update global game time using the scaled delta
        const delta = now - this.lastUpdate;
        this.gameTime += delta * this.timeScale;
        this.lastUpdate = now;

        // Track which systems had objects updated this tick
        const afterUpdateMap = new Map<System<any>, GameObject[]>();

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
                // Ensure beforeUpdate() gets called once per system per tick
                if (!afterUpdateMap.has(system)) {
                    system.beforeUpdate?.(this.gameTime);
                    afterUpdateMap.set(system, []);
                }
                afterUpdateMap.get(system)!.push(object);

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

        // Call afterUpdate() for each system once per tick
        for (const [system, objs] of afterUpdateMap) {
            system.afterUpdate?.(this.gameTime, objs);
        }
    }

    // -------------------------------------------------------------------
    // Queries
    // -------------------------------------------------------------------
    public query(
        components: ComponentFactory<any>[],
        ids?: number[]
    ): GameObject[] {
        const targets = ids
            ? ids.map((id) => this.objects.get(id))
            : this.objects.values();
        const found: GameObject[] = [];

        for (const object of targets) {
            if (!object) continue;
            if (object.hasComponents(components)) found.push(object);
        }
        return found;
    }

    // -------------------------------------------------------------------
    // Internal: Object ↔ System bookkeeping
    // -------------------------------------------------------------------
    private inject(system: System<any>): void {
        system.world = this;
        // @ts-expect-error: trigger type will be injected at runtime
        system.trigger = this.triggerSystems.bind(this);
    }

    private onObjectComponentChange(
        object: GameObject,
        added?: Component<any>,
        removed?: Component<any>
    ): void {
        const set = this.objectSystems.get(object.id);
        if (!set) return;

        for (const system of set) {
            const watch = system.componentIds;
            const shouldNotify =
                watch.size === 0 ||
                (added && watch.has(added.id)) ||
                (removed && watch.has(removed.id));
            if (shouldNotify) {
                system.change?.call(
                    system,
                    object,
                    added && watch.has(added.id) ? added : undefined,
                    removed && watch.has(removed.id) ? removed : undefined
                );
            }
        }
    }

    /** Returns whether the given system currently applies to an object */
    private hasSystem(object: GameObject, system: System<any>): boolean {
        return this.objectSystems.get(object.id)?.has(system) ?? false;
    }

    /** Remove all tracking state of system from object */
    private untrackObjectSystem(object: GameObject, system: System<any>): void {
        this.objectSystems.get(object.id)?.delete(system);
        this.objectLastUpdateGT.get(object.id)?.delete(system.id);
        this.objectLastUpdateRT.get(object.id)?.delete(system.id);
    }

    /** Check and (re)index one object against all or one system */
    private indexObject(object: GameObject, single?: System<any>): void {
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
                this.objectLastUpdateRT.get(object.id)!.set(system.id, NOW());
                system.enter?.call(system, object);
            } else if (!qualifies && already) {
                system.exit?.call(system, object);
                this.untrackObjectSystem(object, system);
            }
        }
    }
}











