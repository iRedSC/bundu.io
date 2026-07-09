import { Physics } from "../components/base.js";
import { System, GameObject } from "@ioengine/server";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { VisibleObjects } from "../components/visible_objects.js";
import { Range } from "@ioengine/lib";
import { quadtree } from "./position.js";

const RENDER_DISTANCE_X = 2200;
const RENDER_DISTANCE_Y = 1250;

export class RenderDistanceSystem extends System<GameEventMap> {
    constructor() {
        super([VisibleObjects, Physics], 2);

        this.listen(GameEvent.NewObject, this.newObject, [Physics]);
        this.listen(GameEvent.DeleteObject, this.deleteObject, [Physics]);
    }

    override update(_time: number, _delta: number, object: GameObject): void {
        const physics = object.get(Physics);
        const visibleObjects = object.get(VisibleObjects);

        const renderBounds = new Range(
            {
                x: physics.position.x - RENDER_DISTANCE_X,
                y: physics.position.y - RENDER_DISTANCE_Y,
            },
            {
                x: physics.position.x + RENDER_DISTANCE_X,
                y: physics.position.y + RENDER_DISTANCE_Y,
            }
        );

        const objectsInRenderDistance = this.world.query(
            [Physics],
            quadtree.query(renderBounds.normalized)
        );

        const currentVisibleObjects = new Set(objectsInRenderDistance);
        const oldObjects = visibleObjects.visible.difference(
            currentVisibleObjects
        );
        const newVisibleObjects = currentVisibleObjects.difference(
            visibleObjects.visible
        );

        visibleObjects.visible = currentVisibleObjects;

        if (oldObjects.size > 0)
            this.trigger(GameEvent.ObjectsRemovedFromView, {
                object: object,
                objectsRemoved: Array.from(oldObjects),
            });

        if (newVisibleObjects.size > 0)
            this.trigger(GameEvent.ObjectsAddedToView, {
                object: object,
                objectsAdded: Array.from(newVisibleObjects),
            });
    }

    newObject({ object }: GameEvent.NewObject) {
        const objPhys = object.get(Physics);
        if (!objPhys) return;
        const objectsWithVisibleObjectsComponent = this.world.query([
            VisibleObjects,
        ]);
        for (const obj of objectsWithVisibleObjectsComponent) {
            const visibleObjects = obj.get(VisibleObjects);
            const physics = obj.get(Physics);
            if (!visibleObjects || !physics) continue;

            const bounds = new Range(
                {
                    x: physics.position.x - RENDER_DISTANCE_X,
                    y: physics.position.y - RENDER_DISTANCE_Y,
                },
                {
                    x: physics.position.x + RENDER_DISTANCE_X,
                    y: physics.position.y + RENDER_DISTANCE_Y,
                }
            );

            if (bounds.contains(objPhys.position)) {
                visibleObjects.visible.add(object);
                this.trigger(GameEvent.ObjectsAddedToView, {
                    object: obj,
                    objectsAdded: [object],
                });
            }
        }
    }

    deleteObject({ object }: GameEvent.DeleteObject) {
        const objectsWithVisibleObjectsComponent = this.world.query([
            VisibleObjects,
        ]);
        for (const obj of objectsWithVisibleObjectsComponent) {
            obj.get(VisibleObjects).visible.delete(object);
            this.trigger(GameEvent.ObjectsRemovedFromView, {
                object: obj,
                objectsRemoved: [object],
            });
        }
    }
}
