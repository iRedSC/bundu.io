import { GameObject } from "./game_object.js";

let NEXT_COMPONENT_ID = 1;

export type ComponentFactory<D> = (new (data?: D) => Component<D>) & {
    id: number;
    data: D;
    /**
     * Get component belonging to a specific GameObject.
     *
     * @param object GameObject to get component from.
     * @returns Component belonging to the GameObject
     */
    get(object: GameObject): D;
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
    static register<C>(_default: () => C): ComponentFactory<C> {
        const id = NEXT_COMPONENT_ID++;

        class RegisteredComponent extends Component<C> {
            static id: number = id;
            constructor(data?: C) {
                const _data = data ?? _default();
                super(id, _data);
            }

            static get(object: GameObject): C {
                return object.get<C>(this as unknown as ComponentFactory<C>);
            }
        }

        return RegisteredComponent as any as ComponentFactory<C>;
    }
}
