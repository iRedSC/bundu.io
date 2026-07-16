import { Physics } from "../components/base.js";
import {
    System,
    type GameObject,
    type ServerContext,
    type World,
} from "../engine";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { VisibleObjects } from "../components/visible_objects.js";
import { Range } from "@bundu/shared";
import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { gameplayConfig } from "../configs/gameplay.js";

function getRenderBounds(physics: Physics): Range {
    const distance = gameplayConfig().renderDistance;
    return new Range(
        {
            x: physics.position.x - distance.x,
            y: physics.position.y - distance.y,
        },
        {
            x: physics.position.x + distance.x,
            y: physics.position.y + distance.y,
        }
    );
}

function loadObjectsIntoView(
    viewer: GameObject,
    objects: GameObject[],
    playerPacketManager: ServerContext["playerPacketManager"]
) {
    for (const object of objects) {
        const packet = object.getNewObjectPacket();
        if (!packet) continue;
        playerPacketManager.add(viewer.id, ServerPacket.LoadObject, packet);
    }
}

function deleteObjectsFromView(
    viewer: GameObject,
    objects: GameObject[],
    playerPacketManager: ServerContext["playerPacketManager"]
) {
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
        const { playerPacketManager, quadtree } = this.world.context;

        const renderBounds = getRenderBounds(physics);

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
            deleteObjectsFromView(
                object,
                Array.from(oldObjects),
                playerPacketManager
            );

        if (newVisibleObjects.size > 0)
            loadObjectsIntoView(
                object,
                Array.from(newVisibleObjects),
                playerPacketManager
            );
    }

    newObject({ object }: GameEvent.NewObject) {
        const objPhys = object.get(Physics);
        if (!objPhys) return;
        const { playerPacketManager } = this.world.context;
        const objectsWithVisibleObjectsComponent = this.world.query([
            VisibleObjects,
        ]);
        for (const obj of objectsWithVisibleObjectsComponent) {
            const visibleObjects = obj.get(VisibleObjects);
            const physics = obj.get(Physics);
            if (!visibleObjects || !physics) continue;

            const bounds = getRenderBounds(physics);

            if (bounds.contains(objPhys.position)) {
                visibleObjects.visible.add(object);
                loadObjectsIntoView(obj, [object], playerPacketManager);
            }
        }
    }

    deleteObject({ object }: GameEvent.DeleteObject) {
        const { playerPacketManager } = this.world.context;
        const objectsWithVisibleObjectsComponent = this.world.query([
            VisibleObjects,
        ]);
        for (const obj of objectsWithVisibleObjectsComponent) {
            if (!obj.get(VisibleObjects).visible.delete(object)) continue;
            deleteObjectsFromView(obj, [object], playerPacketManager);
        }
    }
}
