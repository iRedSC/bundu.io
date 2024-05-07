import { GameObject } from "./game_object.js";
import { EventCallback, System } from "./system.js";
import { NOW } from "./now.js";
import { Component, ComponentFactory } from "./component.js";
import Logger from "js-logger";

function checkSubset<T>(subSet: Set<T>, superSet: Set<T>) {
    for (const value of subSet.values()) {
        if (!superSet.has(value)) {
            return false;
        }
    }
    return true;
}

/**
 * A world holds objects
 */
export class World {
    public objects: Map<number, GameObject> = new Map();

    public systems: Map<number, System> = new Map();

    private objectSystems: Map<number, Set<System>> = new Map();

    private objectLastUpdateRT: Map<number, Map<number, number>> = new Map();
    private objectLastUpdateGT: Map<number, Map<number, number>> = new Map();

    private subscriptions: Map<number, () => void> = new Map();

    public timeScale = 1;
    public lastUpdate: number = NOW();
    public gameTime: number = 0;

    constructor(systems?: System[]) {
        if (systems) {
            systems.forEach((system) => {
                this.addSystem(system);
            });
        }
    }

    private triggerSystems = (
        event: string,
        objectIds: number | number[],
        data?: any
    ) => {
        if (typeof objectIds === "number") objectIds = [objectIds];
        for (const system of this.systems.values()) {
            const events: Map<
                string,
                Map<EventCallback<any>, ComponentFactory<any>[]>
            > = system.callbacks;

            if (!events.has(event)) continue;

            const callbacks: Map<
                EventCallback<any>,
                ComponentFactory<any>[]
            > = events.get(event) || new Map();
            const objects = this.query([], objectIds);
            if (callbacks.size <= 0) continue;
            for (const [callback, components] of callbacks.entries()) {
                for (const object of objects) {
                    if (!object.hasComponents(components)) continue;
                    callback(object, data);
                }
            }
        }
    };

    destroy() {
        this.objects.clear();
        this.systems.clear();
    }

    getObject(id: number) {
        return this.objects.get(id);
    }

    addObject(object: GameObject) {
        if (!object || this.objects.has(object.id)) {
            return;
        }

        this.objects.set(object.id, object);
        this.objectLastUpdateGT.set(object.id, new Map());
        this.objectLastUpdateRT.set(object.id, new Map());

        if (this.subscriptions.get(object.id)) {
            this.subscriptions.get(object.id)!();
        }
        this.subscriptions.set(
            object.id,
            object.subscribe((object, added, removed) => {
                this.onObjectComponentChange(object, added, removed);
                this.indexObject(object);
            })
        );
        this.indexObject(object);
        return this;
    }

    removeObject(object: GameObject) {
        if (!object) {
            return;
        }

        this.objects.delete(object.id);

        if (this.subscriptions.get(object.id)) {
            this.subscriptions.get(object.id)!();
        }

        const systems = this.objectSystems.get(object.id) || new Set();
        for (const system of systems.values()) {
            if (system.exit) {
                this.inject(system);
                system.exit(object);
            }
        }

        this.objectSystems.delete(object.id);
        this.objectLastUpdateGT.delete(object.id);
        this.objectLastUpdateRT.delete(object.id);
        return this;
    }

    addSystem(system: System) {
        if (system.world) {
            throw new Error("System already in use.");
        }
        this.inject(system);
        this.systems.set(system.id, system);

        for (const object of this.objects.values()) {
            this.indexObject(object, system);
            if (object.active) {
                if (
                    system.enter &&
                    this.objectSystems.get(object.id)?.has(system)
                ) {
                    system.enter(object);
                }
            }
        }
        return this;
    }

    removeSystem(system: System) {
        if (!this.systems.has(system.id)) {
            return;
        }
        this.systems.delete(system.id);
        for (const object of this.objects.values()) {
            this.indexObject(object, system);
            if (object.active) {
                if (
                    system.exit &&
                    this.objectSystems.get(object.id)?.has(system)
                ) {
                    this.inject(system);
                    system.exit(object);
                }
                this.indexObject(object, system);
            }
        }
        if (system.world === this) {
            system.world = undefined as any;
            system.trigger = undefined as any;
        }
        return this;
    }

    public update() {
        const now = NOW();

        this.gameTime += (now - this.lastUpdate) * this.timeScale;
        this.lastUpdate = now;

        const afterUpdateListeners: Map<System, GameObject[]> = new Map();

        for (const [objectId, object] of this.objects.entries()) {
            if (!object.active) {
                this.removeObject(object);
            }

            const systems = this.objectSystems.get(objectId);
            if (!systems) {
                continue;
            }
            const objectLastUpdateRT = this.objectLastUpdateRT.get(objectId);
            const objectLastUpdateGT = this.objectLastUpdateGT.get(objectId);

            for (const system of systems.values()) {
                if (!afterUpdateListeners.get(system)) {
                    if (system.beforeUpdate) {
                        system.beforeUpdate(this.gameTime);
                    }
                    afterUpdateListeners.set(system, []);
                }
                afterUpdateListeners.get(system)?.push(object);

                if (!system.update) {
                    continue;
                }

                const elapsed = now - objectLastUpdateRT?.get(system.id)!;
                const elapsedScaled =
                    this.gameTime - objectLastUpdateGT?.get(system.id)!;

                const interval = 1000 / system.tps;
                if (elapsed < interval) {
                    continue;
                }
                objectLastUpdateRT?.set(system.id, now - (elapsed % interval));
                objectLastUpdateGT?.set(system.id, this.gameTime);

                system.update(this.gameTime, elapsedScaled, object);
            }
        }
        for (const [system, objects] of afterUpdateListeners.entries()) {
            if (system.afterUpdate) {
                system.afterUpdate(this.gameTime, objects);
            }
        }
    }

    /**
     * Query the world for specific objects.
     * @param componentIds id of components to query for
     * @param ids objects to query for, objects must contain specified components
     * @returns generator that gives requested objects
     */
    public query(
        components: ComponentFactory<any>[],
        ids?: number[]
    ): GameObject[] {
        const objects = ids ? ids.values() : this.objects.keys();

        const found: GameObject[] = [];
        for (const id of objects) {
            const object = this.objects.get(id);
            if (!object) {
                continue;
            }
            if (object.hasComponents(components)) {
                found.push(object);
            }
        }
        return found;
    }

    private inject(system: System) {
        system.world = this;
        system.trigger = this.triggerSystems;
        return system;
    }

    private onObjectComponentChange(
        object: GameObject,
        added?: Component<unknown>,
        removed?: Component<unknown>
    ) {
        if (!this.objectSystems.get(object.id)) {
            return;
        }

        const systemsToNotify: System[] = [];

        for (const system of this.objectSystems.get(object.id)!.values()) {
            if (system.componentIds.size === 0) {
                continue;
            }

            if (added && !system.componentIds.has(added.id)) {
                continue;
            }

            if (removed && !system.componentIds.has(removed.id)) {
                continue;
            }
            systemsToNotify.push(system);
        }

        for (const system of systemsToNotify) {
            const componentIds = system.componentIds;
            const all = componentIds.size === 0;
            system.change?.call(
                system,
                object,
                all
                    ? added
                    : added && componentIds.has(added.id)
                    ? added
                    : undefined,
                all
                    ? removed
                    : removed && componentIds.has(removed.id)
                    ? removed
                    : undefined
            );
        }
    }

    private indexObjectSystem = (object: GameObject, system: System) => {
        const objectSystem = this.objectSystems.get(object.id)!;

        function deleteObject() {
            objectSystem.delete(system);
            this.objectLastUpdateGT.get(object.id)?.delete(system.id);
            this.objectLastUpdateRT.get(object.id)?.delete(system.id);
        }

        // If system doesn not exist in world, delete system from caches.
        if (!this.systems.get(system.id)) {
            if (objectSystem.has(system)) {
                deleteObject();
            }
            return;
        }

        const componentIds = system.componentIds;

        const HasAllComponents = checkSubset(
            componentIds,
            new Set(object.components.map((component) => component.id))
        );
        if (!HasAllComponents) {
            if (objectSystem.has(system)) {
                if (system.exit) {
                    this.inject(system);
                    system.exit(object);
                }
                deleteObject();
            }
            return;
        }

        if (!objectSystem.has(system)) {
            this.objectSystems.get(object.id)?.add(system);
            this.objectLastUpdateRT.get(object.id)?.set(system.id, NOW());
            this.objectLastUpdateGT
                .get(object.id)
                ?.set(system.id, this.gameTime);

            if (system.enter) {
                system.enter(object);
            }
        }
    };

    private indexObject(object: GameObject, system?: System) {
        if (!this.objectSystems.get(object.id)) {
            this.objectSystems.set(object.id, new Set());
        }
        if (system) {
            this.indexObjectSystem(object, system);
        } else {
            this.systems.forEach((system) => {
                this.indexObjectSystem(object, system);
            });
        }
    }
}
