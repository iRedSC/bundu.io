import { GameObject } from "./game_object";

let NEXT_COMPONENT_ID = 1;

export type ComponentFactory<D> = (new (data: D) => Component<D>) & {
    id: number;
    data: D;

    /**
     * Get component belonging to a specific GameObject.
     *
     * @param object GameObject to get component from.
     * @returns Component belonging to the GameObject
     */
    get(object: GameObject): Component<D>;
};

/**
 * A component holds data.
 */
export abstract class Component<D> {
    id: number;
    data: D;

    constructor(id: number, data: D) {
        this.id = id;
        this.data = data;
    }

    /**
     *
     * @returns ComponentFactory that can be instantiated to get a new Component.
     */
    static register<C>(): ComponentFactory<C> {
        const id = NEXT_COMPONENT_ID++;

        class RegisteredComponent extends Component<C> {
            static id: number = id;
            constructor(data: C) {
                super(id, data);
            }

            static get(object: GameObject): RegisteredComponent | undefined {
                const component: RegisteredComponent = (
                    object as any
                ).components.get(this.id);
                return component;
            }
        }
        return RegisteredComponent as any as ComponentFactory<C>;
    }
}
