import { Component, ComponentFactory } from "./component.js";

let NEXT_OBJECT_ID = 1;

export type Subscription = (
    object: GameObject,
    added?: Component<any>,
    removed?: Component<any>
) => void;

function getComponents<T>(component: ComponentFactory<T>): T;
function getComponents<T>(
    component: ComponentFactory<T>,
    all: true
): Component<T>[];
function getComponents<T>(
    this: GameObject,
    component: ComponentFactory<T>,
    all?: boolean
) {
    if (all) {
        return this.components
            .filter((listComponent) => listComponent.id === component.id)
            .map((listComponent) => listComponent.data);
    }
    return this.components.find(
        (listComponent) => listComponent.id === component.id
    )?.data;
}

/**
 * A game object holds different components, and can be put into a world.
 */
export abstract class GameObject {
    public components: Component<any>[] = [];
    private subscriptions: Set<Subscription> = new Set();

    public id: number;
    public active: boolean = true;

    constructor() {
        this.id = NEXT_OBJECT_ID++;
    }

    public subscribe(handler: Subscription): () => GameObject {
        this.subscriptions.add(handler);

        return () => {
            const exists = this.subscriptions.has(handler);
            if (exists) {
                this.subscriptions.delete(handler);
            }
            return this;
        };
    }

    public add(component: Component<any>): GameObject {
        this.components.push(component);
        this.subscriptions.forEach((handler) =>
            handler(this, component, undefined)
        );
        return this;
    }

    public remove(component: Component<any>): GameObject {
        this.components = this.components.filter(
            (listComponent) => listComponent.id !== component.id
        );
        this.subscriptions.forEach((handler) =>
            handler(this, undefined, component)
        );
        return this;
    }

    public hasComponents(components: ComponentFactory<any>[]): boolean {
        if (components.length === 0) {
            return true;
        }
        const componentSet = new Set(
            this.components.map((component) => component.id)
        );
        for (const component of components) {
            if (!componentSet.has(component.id)) {
                return false;
            }
        }
        return true;
    }

    public get: typeof getComponents = getComponents.bind(this);

    public pack: Record<number, () => any[]> = {};
}
