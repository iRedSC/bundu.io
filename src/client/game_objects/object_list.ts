import { Viewport } from "pixi-viewport";
import { AnimationManager } from "../../lib/animation";
import { WorldObject } from "./world_object";

export class World {
    viewport: Viewport;
    animationManager: AnimationManager;
    user?: WorldObject;
    objects: Map<number, WorldObject>;
    dynamicObjs: Map<number, WorldObject>;
    updatingObjs: Map<number, WorldObject>;

    constructor(viewport: Viewport, animationManager: AnimationManager) {
        this.viewport = viewport;
        this.animationManager = animationManager;
        this.objects = new Map();
        this.dynamicObjs = new Map();
        this.updatingObjs = new Map();
    }

    tick() {
        this.animationManager.update();
        for (let [id, entity] of this.updatingObjs.entries()) {
            entity.move();
            if (entity.nextState[0] < Date.now()) {
                this.updatingObjs.delete(id);
            }
        }
    }
}
