import { WORLD_BOUNDS, worldToDeci } from "@bundu/shared/tiles.js";
import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { Circle, Vector } from "sat";
import { Physics } from "../components/base.js";
import { FreecamGhostData } from "../components/freecam_ghost.js";
import { PlayerData } from "../components/player.js";
import { VisibleObjects } from "../components/visible_objects.js";
import {
    System,
    type GameObject,
    type World,
} from "../engine";
import { FreecamGhost } from "../game_objects/freecam_ghost.js";
import { GameEvent, type GameEventMap } from "./event_map.js";

/**
 * Freecam ghost cursors: spawn/despawn with freecam, stream cursor pose, and
 * deliver Load/Delete/SetPosition/Chat outside normal AOI filters.
 */
export class FreecamGhostSystem extends System<GameEventMap> {
    private readonly byOwner = new Map<number, GameObject>();
    /** viewerId → ghost ids currently loaded on that client. */
    private readonly loaded = new Map<number, Set<number>>();

    constructor(world: World) {
        super(world, [FreecamGhostData]);
        this.listen(GameEvent.DeleteObject, this.onOwnerDeleted, [PlayerData]);
    }

    /** Spawn a ghost for a freecam player (hidden from non-freecam by default). */
    spawnFor(player: GameObject): void {
        const data = PlayerData.get(player);
        const physics = Physics.get(player);
        if (!data || !physics) return;
        this.despawnFor(player.id);

        const position = new Vector(physics.position.x, physics.position.y);
        const ghost = new FreecamGhost(
            {
                position,
                collider: new Circle(position, physics.collisionRadius),
                rotation: 0,
                collisionRadius: physics.collisionRadius,
                speed: 0,
            },
            {
                ownerId: player.id,
                visibleToPlayers: false,
                name: data.name,
                playerSkin: data.playerSkin,
            }
        );
        this.world.addObject(ghost);
        this.byOwner.set(player.id, ghost);
        this.reconcileGhost(ghost);
    }

    despawnFor(ownerId: number): void {
        const ghost = this.byOwner.get(ownerId);
        if (!ghost) return;
        this.unloadEverywhere(ghost);
        this.byOwner.delete(ownerId);
        if (this.world.getObject(ghost.id)) {
            this.world.removeObject(ghost);
        }
    }

    setVisibleToPlayers(ownerId: number, visible: boolean): void {
        const ghost = this.byOwner.get(ownerId);
        if (!ghost) return;
        const data = FreecamGhostData.get(ghost);
        if (!data || data.visibleToPlayers === visible) return;
        data.visibleToPlayers = visible;
        this.reconcileGhost(ghost);
    }

    setCursor(ownerId: number, x: number, y: number): void {
        const ghost = this.byOwner.get(ownerId);
        if (!ghost) return;
        const physics = Physics.get(ghost);
        if (!physics) return;
        physics.position.x = Math.min(Math.max(x, 0), WORLD_BOUNDS);
        physics.position.y = Math.min(Math.max(y, 0), WORLD_BOUNDS);
        this.broadcastPosition(ghost);
    }

    /** Chat bubble + log for viewers who currently have this owner's ghost. */
    emitChat(ownerId: number, message: string): boolean {
        const ghost = this.byOwner.get(ownerId);
        if (!ghost) return false;
        const { playerPacketManager } = this.world.context;
        for (const viewerId of this.viewersWith(ghost.id)) {
            playerPacketManager.add(viewerId, ServerPacket.ChatMessage, {
                id: ghost.id,
                message,
            });
        }
        return true;
    }

    ghostIdFor(ownerId: number): number | undefined {
        return this.byOwner.get(ownerId)?.id;
    }

    /** Re-sync ghosts for a viewer (join / clientReady / freecam enter). */
    reconcileViewer(viewer: GameObject): void {
        for (const ghost of this.byOwner.values()) {
            this.syncViewerGhost(viewer, ghost);
        }
    }

    private onOwnerDeleted = ({ object }: GameEvent.DeleteObject) => {
        this.despawnFor(object.id);
        this.loaded.delete(object.id);
    };

    private reconcileGhost(ghost: GameObject): void {
        for (const viewer of this.world.query([PlayerData, VisibleObjects])) {
            if (!this.world.context.socketManager.getSocket(viewer.id)) continue;
            this.syncViewerGhost(viewer, ghost);
        }
    }

    private syncViewerGhost(viewer: GameObject, ghost: GameObject): void {
        const should = this.canSee(viewer, ghost);
        const has = this.loaded.get(viewer.id)?.has(ghost.id) ?? false;
        const { playerPacketManager } = this.world.context;
        if (should && !has) {
            const packet = ghost.getNewObjectPacket();
            if (!packet) return;
            playerPacketManager.add(viewer.id, ServerPacket.LoadObject, packet);
            let set = this.loaded.get(viewer.id);
            if (!set) {
                set = new Set();
                this.loaded.set(viewer.id, set);
            }
            set.add(ghost.id);
            return;
        }
        if (!should && has) {
            playerPacketManager.add(viewer.id, ServerPacket.DeleteObjects, {
                objects: [ghost.id],
            });
            this.loaded.get(viewer.id)?.delete(ghost.id);
        }
    }

    private canSee(viewer: GameObject, ghost: GameObject): boolean {
        const ghostData = FreecamGhostData.get(ghost);
        if (!ghostData) return false;
        if (viewer.id === ghostData.ownerId) return false;
        const viewerData = PlayerData.get(viewer);
        if (!viewerData) return false;
        if (viewerData.freecam) return true;
        return ghostData.visibleToPlayers;
    }

    private broadcastPosition(ghost: GameObject): void {
        const physics = Physics.get(ghost);
        if (!physics) return;
        const { playerPacketManager } = this.world.context;
        const packet = {
            id: ghost.id,
            x: worldToDeci(physics.position.x),
            y: worldToDeci(physics.position.y),
        };
        for (const viewerId of this.viewersWith(ghost.id)) {
            playerPacketManager.add(
                viewerId,
                ServerPacket.SetPosition,
                packet
            );
        }
    }

    private unloadEverywhere(ghost: GameObject): void {
        const { playerPacketManager } = this.world.context;
        for (const [viewerId, set] of this.loaded) {
            if (!set.delete(ghost.id)) continue;
            playerPacketManager.add(viewerId, ServerPacket.DeleteObjects, {
                objects: [ghost.id],
            });
        }
    }

    private viewersWith(ghostId: number): number[] {
        const ids: number[] = [];
        for (const [viewerId, set] of this.loaded) {
            if (set.has(ghostId)) ids.push(viewerId);
        }
        return ids;
    }
}
