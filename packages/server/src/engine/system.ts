import { type ComponentFactory } from "./component.js";
import { GameObject } from "./game_object.js";
import { World } from "./world.js";

let NEXT_SYSTEM_ID = 1;

export type SystemEventCallback<M, K extends keyof M> = (data: M[K]) => void;

/** Heterogeneous system handle for World registries (mixed EventMaps). */
export type AnySystem = System<Record<string | number | symbol, unknown>>;

export abstract class System<
    EventMap extends Record<string | number | symbol, unknown>
> {
    readonly id: number;
    /** Target updates per second, measured against World.gameTime. */
    readonly tps: number;
    readonly componentIds: Set<number> = new Set();

    readonly world: World;

    readonly trigger: <T extends keyof EventMap>(
        event: T,
        data: EventMap[T]
    ) => void;

    readonly callbacks = new Map<
        string | number | symbol,
        Map<(data: unknown) => void, ComponentFactory<unknown>[]>
    >();

    public update?(time: number, delta: number, object: GameObject): void;

    public enter?(object: GameObject): void;

    public exit?(object: GameObject): void;

    constructor(
        world: World,
        // Factories are invariant in data; accept via structural id list.
        componentIds: readonly { readonly id: number }[],
        tps: number = 20
    ) {
        this.id = NEXT_SYSTEM_ID++;
        this.componentIds = new Set(
            componentIds.map((component) => component.id)
        );
        this.tps = tps;
        this.world = world;
        this.trigger = (event, data) => {
            world.dispatch(event, data);
        };
    }

    protected query(
        componentTypes: readonly { readonly id: number }[]
    ): GameObject[] {
        return this.world.query(
            componentTypes as ComponentFactory<unknown>[]
        );
    }

    public listen<T extends keyof EventMap>(
        event: T,
        callback: SystemEventCallback<EventMap, T>,
        components?: readonly { readonly id: number }[],
        once?: boolean
    ) {
        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, new Map());
        }
        let registered = callback as (data: unknown) => void;
        if (once) {
            const temp = registered;
            registered = (data: unknown) => {
                temp.call(this, data);
                this.callbacks.get(event)?.delete(registered);
            };
        }
        this.callbacks
            .get(event)
            ?.set(
                registered,
                (components || []) as ComponentFactory<unknown>[]
            );
    }
}
