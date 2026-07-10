import { Physics } from "../components/base.js";
import { System, GameObject, type World } from "../engine";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { VisibleObjects } from "../components/visible_objects.js";
import { Range } from "@bundu/shared";
import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { playerPacketManager } from "../network/managers.js";
import { quadtree } from "./position.js";

const RENDER_DISTANCE_X = 2200;
const RENDER_DISTANCE_Y = 1250;

function loadObjectsIntoView(viewer: GameObject, objects: GameObject[]) {
    for (const object of objects) {
        const packet = object.getNewObjectPacket();
        if (!packet) continue;
        playerPacketManager.add(viewer.id, ServerPacket.LoadObject, packet);
    }
}

function deleteObjectsFromView(viewer: GameObject, objects: GameObject[]) {
    playerPacketManager.add(viewer.id, ServerPacket.DeleteObjects, {
        objects: objects.map((o) => o.id),
    });
}

export class RenderDistanceSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [VisibleObjects, Physics], 2);

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
            deleteObjectsFromView(object, Array.from(oldObjects));

        if (newVisibleObjects.size > 0)
            loadObjectsIntoView(object, Array.from(newVisibleObjects));
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
                loadObjectsIntoView(obj, [object]);
            }
        }
    }

    deleteObject({ object }: GameEvent.DeleteObject) {
        const objectsWithVisibleObjectsComponent = this.world.query([
            VisibleObjects,
        ]);
        for (const obj of objectsWithVisibleObjectsComponent) {
            obj.get(VisibleObjects).visible.delete(object);
            deleteObjectsFromView(obj, [object]);
        }
    }
}
