import { Component, ComponentFactory } from "./component.js";
import { GameObject } from "./game_object.js";
import { World } from "./world.js";

let NEXT_SYSTEM_ID = 1;

export type EventCallback = (
    objects: IterableIterator<GameObject>,
    data?: any
) => void;

export abstract class System {
    readonly id: number;
    readonly tps: number;
    readonly componentIds: Set<number> = new Set();

    public world: World = undefined as any;
    public trigger: (
        event: string,
        objectIds?: Set<number> | number,
        data?: any
    ) => void = undefined as any;

    readonly callbacks: Map<string, Set<EventCallback>> = new Map();

    public beforeUpdate?(time: number): void;

    public update?(time: number, delta: number, object: GameObject): void;

    public afterUpdate?(time: number, objects: Set<GameObject>): void;

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

    protected query(componentTypes: number[]): Iterator<GameObject> {
        return this.world.query(componentTypes).values();
    }

    public listen(event: string, callback: EventCallback, once?: boolean) {
        if (!this.callbacks.has(event)) {
            this.callbacks.set(event, new Set());
        }
        if (once) {
            const temp = callback.bind(callback);

            callback = (data: any, objects: Iterator<GameObject>) => {
                temp(data, objects);
                this.callbacks.get(event)?.delete(callback);
            };
        }
        this.callbacks.get(event)?.add(callback);
    }
}
