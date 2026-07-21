import { Physics, AnimalData, VisualBounds } from "../components/base.js";
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
import { PlayerData } from "../components/player.js";
import { AnonProxy } from "../components/anon_proxy.js";
import { isVisibleToViewer } from "./anon_occlusion.js";
import { modelBoundsPadding } from "../configs/model_bounds.js";

function getBodyRenderBounds(physics: Physics): Range {
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

function getViewerBounds(viewer: GameObject): Range | undefined {
    const data = PlayerData.get(viewer);
    if (data?.freecam && data.freecamView) {
        const view = data.freecamView;
        return new Range(
            { x: view.minX, y: view.minY },
            { x: view.maxX, y: view.maxY }
        );
    }
    const physics = Physics.get(viewer);
    if (!physics) return undefined;
    return getBodyRenderBounds(physics);
}

function isMover(object: GameObject): boolean {
    return (
        PlayerData.get(object) !== undefined ||
        AnimalData.get(object) !== undefined ||
        AnonProxy.get(object) !== undefined
    );
}

function intersectsView(bounds: Range, object: GameObject): boolean {
    const physics = object.get(Physics);
    const visual = VisualBounds.get(object);
    if (!visual) return bounds.contains(physics.position);
    return bounds.intersects(
        new Range(
            {
                x: physics.position.x + visual.minX,
                y: physics.position.y + visual.minY,
            },
            {
                x: physics.position.x + visual.maxX,
                y: physics.position.y + visual.maxY,
            }
        )
    );
}

function paddedBounds(bounds: Range): Range {
    const [min, max] = bounds.normalized;
    const padding = modelBoundsPadding();
    return new Range(
        { x: min.x - padding, y: min.y - padding },
        { x: max.x + padding, y: max.y + padding }
    );
}

function loadObjectsIntoView(
    viewer: GameObject,
    objects: GameObject[],
    playerPacketManager: ServerContext["playerPacketManager"],
    world: World
) {
    for (const object of objects) {
        if (!isVisibleToViewer(viewer, object, world)) continue;
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
    if (objects.length === 0) return;
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

    loadView(object: GameObject): void {
        object.get(VisibleObjects).visible.clear();
        this.update(this.world.gameTime, 0, object);
    }

    /** Ensure the viewer has received LoadObject for themselves. */
    ensureSelfVisible(player: GameObject): void {
        const visible = VisibleObjects.get(player);
        if (!visible) return;
        if (!visible.visible.has(player)) {
            loadObjectsIntoView(
                player,
                [player],
                this.world.context.playerPacketManager,
                this.world
            );
        }
        const others = [...visible.visible].filter(
            (object) => object !== player
        );
        if (others.length > 0) {
            deleteObjectsFromView(
                player,
                others,
                this.world.context.playerPacketManager
            );
        }
        visible.visible = new Set([player]);
    }

    /** Soft-despawn: hide from peers, clear AOI, wait for client ViewBounds. */
    enterFreecam(player: GameObject): void {
        const data = PlayerData.get(player);
        if (!data) return;
        data.freecam = true;
        data.freecamView = undefined;
        this.world.context.quadtree.delete(player.id);
        this.removeFromPeerViews(player);
        this.ensureSelfVisible(player);
        this.world.context.playerPacketManager.set(
            player.id,
            ServerPacket.FreecamMode,
            { enabled: true }
        );
    }

    exitFreecam(player: GameObject): void {
        const data = PlayerData.get(player);
        if (!data) return;
        data.freecam = false;
        data.freecamView = undefined;
        const physics = Physics.get(player);
        if (physics) {
            this.world.context.quadtree.insert(player.id, physics.position);
        }
        this.world.context.playerPacketManager.set(
            player.id,
            ServerPacket.FreecamMode,
            { enabled: false }
        );
        this.loadView(player);
        // Re-announce to peers whose AOI contains the body.
        if (physics) {
            this.newObject({ object: player });
        }
    }

    setViewBounds(
        player: GameObject,
        bounds: {
            minX: number;
            minY: number;
            maxX: number;
            maxY: number;
            overview: boolean;
        }
    ): void {
        const data = PlayerData.get(player);
        if (!data?.freecam) return;
        data.freecamView = bounds;
        this.update(this.world.gameTime, 0, player);
    }

    private removeFromPeerViews(player: GameObject): void {
        const { playerPacketManager } = this.world.context;
        for (const viewer of this.world.query([VisibleObjects])) {
            if (viewer === player) continue;
            const visible = viewer.get(VisibleObjects);
            if (!visible.visible.delete(player)) continue;
            deleteObjectsFromView(viewer, [player], playerPacketManager);
        }
    }

    override update(_time: number, _delta: number, object: GameObject): void {
        // Kill mid-step leaves the viewer in this tick's system snapshot.
        // Skip AOI so we don't LoadObject the corpse (newObject already skips).
        if (!object.active) return;

        const visibleObjects = object.get(VisibleObjects);
        const { playerPacketManager, quadtree } = this.world.context;
        const data = PlayerData.get(object);

        // Freecam with no client bounds yet — keep only self loaded.
        if (data?.freecam && !data.freecamView) {
            const keepSelf = new Set([object]);
            const oldObjects = visibleObjects.visible.difference(keepSelf);
            if (oldObjects.size > 0) {
                deleteObjectsFromView(
                    object,
                    Array.from(oldObjects),
                    playerPacketManager
                );
            }
            if (!visibleObjects.visible.has(object)) {
                loadObjectsIntoView(
                    object,
                    [object],
                    playerPacketManager,
                    this.world
                );
            }
            visibleObjects.visible = keepSelf;
            return;
        }

        const renderBounds = getViewerBounds(object);
        if (!renderBounds) return;

        let objectsInRenderDistance = this.world.query(
            [Physics],
            quadtree.query(paddedBounds(renderBounds).normalized)
        );

        if (data?.freecam && data.freecamView?.overview) {
            objectsInRenderDistance = objectsInRenderDistance.filter(
                (candidate) => !isMover(candidate) || candidate === object
            );
        }

        const filtered = objectsInRenderDistance.filter(
            (candidate) =>
                intersectsView(renderBounds, candidate) &&
                isVisibleToViewer(object, candidate, this.world)
        );
        if (!filtered.includes(object)) filtered.push(object);

        const currentVisibleObjects = new Set(filtered);
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
                playerPacketManager,
                this.world
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
            // Dying players stay in-world until next step — don't send them the corpse.
            if (!obj.active) continue;
            const visibleObjects = obj.get(VisibleObjects);
            if (!visibleObjects) continue;

            const bounds = getViewerBounds(obj);
            if (!bounds) continue;

            const viewerData = PlayerData.get(obj);
            if (
                viewerData?.freecam &&
                viewerData.freecamView?.overview &&
                isMover(object)
            ) {
                continue;
            }

            if (!isVisibleToViewer(obj, object, this.world)) continue;

            if (intersectsView(bounds, object)) {
                visibleObjects.visible.add(object);
                loadObjectsIntoView(
                    obj,
                    [object],
                    playerPacketManager,
                    this.world
                );
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
            // Don't tell the deleted / dying viewer about their own removal.
            if (obj === object || !obj.active) continue;
            deleteObjectsFromView(obj, [object], playerPacketManager);
        }
    }
}
