import { Component, ComponentFactory } from "./component.js";
import { GameObject } from "./game_object.js";
import { World } from "./world.js";
import { GameEventMap } from "./event_map.js";

let NEXT_SYSTEM_ID = 1;

export type EventCallback<T extends keyof GameEventMap> = (
    object: GameObject,
    data: GameEventMap[T],
    ...args: any[]
) => void;

export abstract class System {
    readonly id: number;
    readonly tps: number;
    readonly componentIds: Set<number> = new Set();

    public world: World = undefined as any;

    public trigger: <T extends keyof GameEventMap>(
        event: T,
        objectIds: number | number[],
        data?: GameEventMap[T]
    ) => void = undefined as any;

    readonly callbacks: Map<
        string,
        Map<EventCallback<any>, ComponentFactory<any>[]>
    > = new Map();

    public beforeUpdate?(time: number): void;

    public update?(time: number, delta: number, object: GameObject): void;

    public afterUpdate?(time: number, objects: GameObject[]): void;

    public change?(
        object: GameObject,
        added?: Component<any>,
        removed?: Component<any>
    ): void;

    public enter?(object: GameObject): void;

    public exit?(object: GameObject): void;

    constructor(componentIds: ComponentFactory<any>[], tps: number = 20) {
        this.id = NEXT_SYSTEM_ID++;
        this.componentIds = new Set(
            componentIds.map((component) => component.id)
        );
        this.tps = tps;
    }

    protected query(componentTypes: ComponentFactory<any>[]): GameObject[] {
        return this.world.query(componentTypes);
    }

    public listen<T extends keyof GameEventMap>(
        event: T,
        callback: EventCallback<T>,
        components?: ComponentFactory<any>[],
        once?: boolean
    ) {
        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, new Map());
        }
        if (once) {
            const temp = callback.bind(callback);

            callback = (object: GameObject, data: any) => {
                temp(object, data);
                this.callbacks.get(event)?.delete(callback);
            };
        }
        this.callbacks.get(event)?.set(callback, components || []);
    }
}
