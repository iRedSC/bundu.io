import { Viewport } from "pixi-viewport";
import { AnimationManager } from "../../lib/animations.js";
import { Quadtree } from "../../lib/quadtree.js";
import { BasicPoint } from "../../lib/types.js";
import { LayeredRenderer } from "./layered_renderer.js";
import { Container } from "pixi.js";

interface IDContainer extends Container {
    id: number;
}

export abstract class GameObject {
    id: number;

    position: BasicPoint;
    rotation: number;

    /**
     * Update the object.
     */
    update(): void;

    get containers(): IDContainer[];
}

/**
 * Holds a list of objects, and allows for different forms of access.
 */
export abstract class ObjectContainer {
    objects: Map<number, GameObject>;
    updating: Set<GameObject>;
    quadtree: Quadtree;

    /**
     * Add an object to this container.
     * @param object Object to add to container
     */
    add(object: GameObject): void;

    /**
     * Remove an object from this container
     * @param object Object or ID to remove from container
     */
    remove(object: GameObject | number): void;

    /**
     * Update objects in the updating set.
     */
    update(): void;
}

/**
 * The world class controls all objects in the world.
 * This of course does not include the UI.
 */
export abstract class World {
    animations: AnimationManager;

    viewport: Viewport;
    renderer: LayeredRenderer;

    decorations: ObjectContainer;

    objects: ObjectContainer;
}
