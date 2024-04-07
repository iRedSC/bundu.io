import { Component, ComponentFactory } from "./component.js";

let NEXT_OBJECT_ID = 1;

export type Subscription = (
    object: GameObject,
    added?: Component<any>,
    removed?: Component<any>
) => void;

/**
 * A game object holds different components, and can be put into a world.
 */
export abstract class GameObject {
    public components: Map<number, Component<any>> = new Map();
    private subscriptions: Set<Subscription> = new Set();

    public id: number;
    public active: boolean = true;

    constructor() {
        this.id = NEXT_OBJECT_ID++;
    }

    public subscribe(handler: Subscription) {
        this.subscriptions.add(handler);

        return () => {
            const exists = this.subscriptions.has(handler);
            if (exists) {
                this.subscriptions.delete(handler);
            }
            return this;
        };
    }

    public add(component: Component<any>) {
        this.components.set(component.id, component);
        this.subscriptions.forEach((handler) =>
            handler(this, component, undefined)
        );
    }

    public remove(component: Component<any>) {
        this.components.delete(component.id);
        this.subscriptions.forEach((handler) =>
            handler(this, undefined, component)
        );
    }

    public hasComponents(components: ComponentFactory<any>[] | number[]) {
        if (components.length === 0) {
            return true;
        }
        if (typeof components[0] === "number") {
            for (const component of components as number[]) {
                if (!this.components.has(component)) {
                    return false;
                }
            }
            return true;
        }
        for (const component of components as ComponentFactory<any>[]) {
            if (!this.components.has(component.id)) {
                return false;
            }
        }
        return true;
    }

    public pack: { [key: string]: () => any[] } = {};
}
