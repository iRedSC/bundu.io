import { Range } from "@bundu/shared";
import { GameObjectData } from "@bundu/shared/object_types.js";
import { worldToDeci, worldToTile } from "@bundu/shared/tiles";
import { Circle, Vector } from "sat";
import { getVariantId } from "@bundu/shared/variant_map.js";
import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { Attributes } from "../components/attributes.js";
import { Physics } from "../components/base.js";
import { AnonProxy } from "../components/anon_proxy.js";
import { PlayerData } from "../components/player.js";
import { VisibleObjects } from "../components/visible_objects.js";
import { gameplayConfig } from "../configs/gameplay.js";
import { matchingPayloads } from "../configs/loaders/effect_context.js";
import { ItemConfigs } from "../configs/loaders/items.js";
import type { Hide, VisualHideSource } from "../configs/loaders/hide.js";
import { orHide, shouldAnonymize } from "../configs/loaders/hide.js";
import { System, type GameObject, type World } from "../engine";
import { AnonymousPlayer } from "../game_objects/anonymous_player.js";
import {
    forEachSpatialHidePayload,
    resolveSpatialHide,
} from "./effect_contexts.js";
import { subjectMatchesTarget } from "./effect_targets.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import type { RoofSystem } from "./roof.js";

const EQUIP_SLOTS = [
    ["mainHand", "whenMainHand"],
    ["offHand", "whenOffHand"],
    ["helmet", "whenHelmet"],
] as const;

/** Visit each equip hide payload for a player (before OR-merge). */
function forEachEquipHidePayload(
    player: GameObject,
    world: World,
    visit: (hide: Hide) => void
): void {
    const data = PlayerData.get(player);
    if (!data) return;

    for (const [slot, contextName] of EQUIP_SLOTS) {
        const itemId = data[slot];
        if (itemId === undefined) continue;
        const context = ItemConfigs.get(itemId)[contextName];
        if (!context) continue;
        for (const payload of matchingPayloads(context, (t) =>
            subjectMatchesTarget(player, t, { world, executor: player })
        )) {
            if (payload.hide) visit(payload.hide);
        }
    }
}

/** Effective hide for a player (spatial contexts OR equipped gear). */
export function resolveEffectiveHide(
    player: GameObject,
    world: World
): Hide | undefined {
    if (!PlayerData.get(player)) return undefined;

    let hide = resolveSpatialHide(player, world);
    forEachEquipHidePayload(player, world, (payload) => {
        hide = orHide(hide, payload);
    });
    return hide;
}

/**
 * Per-source visual hide contributions. Exclusion targets are not merged —
 * being excluded from one source must not cancel another.
 */
export function collectVisualHideSources(
    player: GameObject,
    world: World
): VisualHideSource[] {
    if (!PlayerData.get(player)) return [];

    const sources: VisualHideSource[] = [];
    const visit = (hide: Hide) => {
        if (hide.visualEffect !== "self" && hide.visualEffect !== "exclusions") {
            return;
        }
        sources.push({
            visualEffect: hide.visualEffect,
            exclusionTarget: hide.exclusionTarget,
        });
    };
    forEachSpatialHidePayload(player, world, visit);
    forEachEquipHidePayload(player, world, visit);
    return sources;
}

/**
 * Whether `viewer` should see `subject`'s real model as semi-transparent.
 * Never applies to anon proxies.
 */
export function shouldSeeHideVisual(
    viewer: GameObject,
    subject: GameObject,
    world: World,
    sources?: readonly VisualHideSource[]
): boolean {
    if (AnonProxy.get(subject)) return false;
    if (!PlayerData.get(subject)) return false;

    const list = sources ?? collectVisualHideSources(subject, world);
    for (const source of list) {
        if (source.visualEffect === "self") {
            if (viewer === subject) return true;
            continue;
        }
        // exclusions: everyone except matching exclusionTarget
        if (source.exclusionTarget) {
            const excluded = subjectMatchesTarget(
                viewer,
                source.exclusionTarget,
                { world, executor: subject }
            );
            if (!excluded) return true;
        } else {
            return true;
        }
    }
    return false;
}

/** Patch LoadObject player data with viewer-relative ghosted flag. */
export function loadObjectPacketForViewer(
    object: GameObject,
    viewer: GameObject,
    world: World
): ServerPacket.LoadObject | undefined {
    const packet = object.getNewObjectPacket();
    if (!packet) return undefined;
    if (packet.type !== GameObjectData.PlayerType) return packet;

    const ghosted = shouldSeeHideVisual(viewer, object, world);
    if (packet.data[8] === ghosted) return packet;
    const data = [...packet.data] as GameObjectData.PlayerData;
    data[8] = ghosted;
    return { ...packet, data };
}

export function sameRoofGroup(
    a: PlayerData | undefined,
    b: PlayerData | undefined
): boolean {
    return (
        a?.underRoofGroupId !== undefined &&
        a.underRoofGroupId === b?.underRoofGroupId
    );
}

/**
 * Viewer-relative visibility for occlusion + freecam.
 * Proxies are only shown to outsiders; real bodies are hidden from them when
 * full/anonymize is active (same-roof peers still see the real player).
 */
export function isVisibleToViewer(
    viewer: GameObject,
    candidate: GameObject,
    world: World
): boolean {
    if (viewer === candidate) return true;

    const viewerData = PlayerData.get(viewer);
    // Overview freecam omits other movers — keep in sync with RenderDistanceSystem.
    if (
        viewerData?.freecam &&
        viewerData.freecamView?.overview &&
        (PlayerData.get(candidate) !== undefined ||
            AnonProxy.get(candidate) !== undefined)
    ) {
        return false;
    }

    const candidateData = PlayerData.get(candidate);
    if (candidateData?.freecam) return false;

    const proxy = AnonProxy.get(candidate);
    if (proxy) {
        const source = world.getObject(proxy.sourceId);
        if (!source || !PlayerData.get(source)) return false;
        return shouldSeeAnonProxy(viewer, source, world);
    }

    if (!candidateData) return true;

    const hide = resolveEffectiveHide(candidate, world);
    if (!hide) return true;
    if (!hide.full && !shouldAnonymize(hide)) return true;

    return sameRoofGroup(PlayerData.get(viewer), candidateData);
}

function shouldSeeAnonProxy(
    viewer: GameObject,
    source: GameObject,
    world: World
): boolean {
    if (viewer === source) return false;
    const sourceData = PlayerData.get(source);
    if (!sourceData || sourceData.freecam) return false;
    if (sameRoofGroup(PlayerData.get(viewer), sourceData)) return false;
    return shouldAnonymize(resolveEffectiveHide(source, world));
}

export function getAnonProxyId(sourceId: number): number | undefined {
    return proxyBySource.get(sourceId);
}

export function hidesFromLeaderboard(
    player: GameObject,
    world: World
): boolean {
    return resolveEffectiveHide(player, world)?.leaderboard === true;
}

const proxyBySource = new Map<number, number>();
const sourceByProxy = new Map<number, number>();
/** viewerId → subjectId → ghosted */
const ghostedByViewer = new Map<number, Map<number, boolean>>();

function ghostKeySet(
    viewerId: number,
    subjectId: number,
    ghosted: boolean
): boolean {
    let bySubject = ghostedByViewer.get(viewerId);
    if (!bySubject) {
        bySubject = new Map();
        ghostedByViewer.set(viewerId, bySubject);
    }
    const prev = bySubject.get(subjectId);
    if (prev === ghosted) return false;
    bySubject.set(subjectId, ghosted);
    return true;
}

/** Record ghosted state when LoadObject is sent (avoids duplicate SetPlayerVisual). */
export function noteGhostedOnLoad(
    viewerId: number,
    subjectId: number,
    ghosted: boolean
): void {
    let bySubject = ghostedByViewer.get(viewerId);
    if (!bySubject) {
        bySubject = new Map();
        ghostedByViewer.set(viewerId, bySubject);
    }
    bySubject.set(subjectId, ghosted);
}

/** Drop tracked ghost state when a subject leaves a viewer's AOI. */
export function clearGhostedForView(
    viewerId: number,
    subjectIds: readonly number[]
): void {
    const bySubject = ghostedByViewer.get(viewerId);
    if (!bySubject) return;
    for (const id of subjectIds) bySubject.delete(id);
}

function clearGhostStateForSubject(subjectId: number): void {
    for (const bySubject of ghostedByViewer.values()) {
        bySubject.delete(subjectId);
    }
}

function clearGhostStateForViewer(viewerId: number): void {
    ghostedByViewer.delete(viewerId);
}

/**
 * Tracks under-roof groups, spawns/mirrors anon proxies, and keeps scrubbed
 * appearance/equipment in sync for outsiders. Also reconciles viewer-relative
 * hide visual transparency on real player bodies.
 */
export class AnonOcclusionSystem extends System<GameEventMap> {
    private roofSystem?: RoofSystem;
    /** Sources whose real body is currently hidden from outsiders. */
    private readonly hiddenFromOutsiders = new Set<number>();

    constructor(world: World, roofSystem?: RoofSystem) {
        super(world, [PlayerData, Physics], 20);
        this.roofSystem = roofSystem;
        this.listen(GameEvent.DeleteObject, this.onDelete);
    }

    setRoofSystem(system: RoofSystem): void {
        this.roofSystem = system;
    }

    override update(_time: number, _delta: number, player: GameObject): void {
        const data = PlayerData.get(player);
        const physics = Physics.get(player);
        if (!data || !physics) return;

        this.refreshUnderRoof(data, physics);

        if (data.freecam) {
            this.destroyProxy(player.id);
            const wasHidden = this.hiddenFromOutsiders.delete(player.id);
            if (wasHidden) this.reconcileVisibility(player);
            this.reconcileVisual(player);
            return;
        }

        const hide = resolveEffectiveHide(player, this.world);
        const anonymize = shouldAnonymize(hide);
        const hideReal = !!hide?.full || anonymize;

        if (anonymize && hide) {
            this.ensureProxy(player, data, physics, hide);
        } else {
            this.destroyProxy(player.id);
        }

        const wasHidden = this.hiddenFromOutsiders.has(player.id);
        if (hideReal) this.hiddenFromOutsiders.add(player.id);
        else this.hiddenFromOutsiders.delete(player.id);

        if (hideReal || wasHidden || proxyBySource.has(player.id)) {
            this.reconcileVisibility(player);
        }
        this.reconcileVisual(player);
    }

    override exit(object: GameObject): void {
        this.destroyProxy(object.id);
        this.hiddenFromOutsiders.delete(object.id);
        clearGhostStateForSubject(object.id);
        clearGhostStateForViewer(object.id);
    }

    private onDelete = ({ object }: GameEvent.DeleteObject) => {
        const proxy = AnonProxy.get(object);
        if (proxy) {
            proxyBySource.delete(proxy.sourceId);
            sourceByProxy.delete(object.id);
            return;
        }
        if (PlayerData.get(object)) {
            this.destroyProxy(object.id);
            this.hiddenFromOutsiders.delete(object.id);
            clearGhostStateForSubject(object.id);
            clearGhostStateForViewer(object.id);
        }
    };

    private refreshUnderRoof(data: PlayerData, physics: Physics): void {
        const roofId = this.world.context.occupancy.get(
            worldToTile(physics.position.x),
            worldToTile(physics.position.y),
            "roof"
        );
        if (roofId === undefined) {
            data.underRoofGroupId = undefined;
            return;
        }
        data.underRoofGroupId = this.roofSystem?.groupId(roofId);
    }

    private reconcileVisibility(player: GameObject): void {
        this.reconcileCandidate(player);
        const proxyId = proxyBySource.get(player.id);
        if (proxyId === undefined) return;
        const proxy = this.world.getObject(proxyId);
        if (proxy) this.reconcileCandidate(proxy);
    }

    private reconcileCandidate(candidate: GameObject): void {
        const physics = Physics.get(candidate);
        if (!physics) return;
        const { playerPacketManager } = this.world.context;
        const distance = gameplayConfig().renderDistance;

        for (const viewer of this.world.query([VisibleObjects])) {
            const visible = VisibleObjects.get(viewer);
            if (!visible) continue;

            const shouldSee =
                isVisibleToViewer(viewer, candidate, this.world) &&
                inViewerRange(viewer, physics.position, distance);
            const has = visible.visible.has(candidate);

            if (shouldSee === has) continue;

            if (shouldSee) {
                const packet = loadObjectPacketForViewer(
                    candidate,
                    viewer,
                    this.world
                );
                if (!packet) continue;
                visible.visible.add(candidate);
                playerPacketManager.add(
                    viewer.id,
                    ServerPacket.LoadObject,
                    packet
                );
                if (packet.type === GameObjectData.PlayerType) {
                    noteGhostedOnLoad(
                        viewer.id,
                        candidate.id,
                        packet.data[8]
                    );
                }
            } else {
                visible.visible.delete(candidate);
                ghostedByViewer.get(viewer.id)?.delete(candidate.id);
                playerPacketManager.add(viewer.id, ServerPacket.DeleteObjects, {
                    objects: [candidate.id],
                });
            }
        }
    }

    /** Sync semi-transparent model state for viewers who already see the subject. */
    private reconcileVisual(subject: GameObject): void {
        if (AnonProxy.get(subject) || !PlayerData.get(subject)) return;

        const sources = collectVisualHideSources(subject, this.world);
        const { playerPacketManager } = this.world.context;

        for (const viewer of this.world.query([VisibleObjects])) {
            const visible = VisibleObjects.get(viewer);
            if (!visible?.visible.has(subject)) {
                ghostedByViewer.get(viewer.id)?.delete(subject.id);
                continue;
            }

            const ghosted = shouldSeeHideVisual(
                viewer,
                subject,
                this.world,
                sources
            );
            if (!ghostKeySet(viewer.id, subject.id, ghosted)) continue;

            playerPacketManager.add(viewer.id, ServerPacket.SetPlayerVisual, {
                id: subject.id,
                ghosted,
            });
        }
    }

    private ensureProxy(
        player: GameObject,
        data: PlayerData,
        physics: Physics,
        hide: Hide
    ): void {
        const proxyId = proxyBySource.get(player.id);
        let proxy =
            proxyId !== undefined
                ? this.world.getObject(proxyId)
                : undefined;

        if (!proxy) {
            const position = new Vector(physics.position.x, physics.position.y);
            proxy = new AnonymousPlayer(
                {
                    position,
                    collider: new Circle(position, physics.collisionRadius),
                    collisionRadius: physics.collisionRadius,
                    rotation: physics.rotation,
                    speed: 0,
                },
                scrubAppearance(player, data, physics, hide)
            );
            this.world.addObject(proxy);
            proxyBySource.set(player.id, proxy.id);
            sourceByProxy.set(proxy.id, player.id);
        }

        this.mirror(proxy, player, data, physics, hide);
    }

    private mirror(
        proxy: GameObject,
        source: GameObject,
        data: PlayerData,
        physics: Physics,
        hide: Hide
    ): void {
        const proxyPhys = Physics.get(proxy);
        const proxyData = AnonProxy.get(proxy);
        if (!proxyPhys || !proxyData) return;

        proxyPhys.position.x = physics.position.x;
        proxyPhys.position.y = physics.position.y;
        proxyPhys.rotation = physics.rotation;
        proxyPhys.collisionRadius = physics.collisionRadius;
        proxyPhys.collider.r = physics.collisionRadius;

        Object.assign(proxyData, scrubAppearance(source, data, physics, hide));

        this.world.context.quadtree.insert(proxy.id, proxyPhys.position);

        const { worldPacketManager } = this.world.context;
        worldPacketManager.set(ServerPacket.SetPosition, {
            id: proxy.id,
            x: worldToDeci(proxyPhys.position.x),
            y: worldToDeci(proxyPhys.position.y),
        });
        worldPacketManager.set(ServerPacket.SetRotation, {
            id: proxy.id,
            rotation: proxyPhys.rotation,
        });
        worldPacketManager.set(ServerPacket.UpdateEquipment, {
            id: proxy.id,
            mainhand: proxyData.mainHand ?? -1,
            offhand: proxyData.offHand ?? -1,
            helmet: proxyData.helmet ?? -1,
            backpack: proxyData.backpack,
        });
    }

    private destroyProxy(sourceId: number): void {
        const proxyId = proxyBySource.get(sourceId);
        if (proxyId === undefined) return;
        proxyBySource.delete(sourceId);
        sourceByProxy.delete(proxyId);

        const proxy = this.world.getObject(proxyId);
        if (!proxy?.active) return;
        proxy.active = false;
        this.trigger(GameEvent.DeleteObject, { object: proxy });
    }
}

function scrubAppearance(
    source: GameObject,
    data: PlayerData,
    physics: Physics,
    hide: Hide
): AnonProxy {
    const scale = Attributes.get(source)?.get("physics.scale") ?? 1;
    return {
        sourceId: source.id,
        name: hide.name ? "" : data.name,
        mainHand: hide.mainHand ? undefined : data.mainHand,
        offHand: hide.offHand ? undefined : data.offHand,
        helmet: hide.helmet ? undefined : data.helmet,
        backpack: hide.backpack ? false : (data.backpack ?? false),
        skinVariant: hide.skin
            ? null
            : (getVariantId(data.playerSkin) ?? null),
        collisionRadius: physics.collisionRadius,
        scale,
    };
}

function inViewerRange(
    viewer: GameObject,
    position: { x: number; y: number },
    distance: { x: number; y: number }
): boolean {
    const viewerData = PlayerData.get(viewer);
    if (viewerData?.freecam && viewerData.freecamView) {
        const view = viewerData.freecamView;
        return new Range(
            { x: view.minX, y: view.minY },
            { x: view.maxX, y: view.maxY }
        ).contains(position);
    }
    const viewerPhys = Physics.get(viewer);
    if (!viewerPhys) return false;
    return new Range(
        {
            x: viewerPhys.position.x - distance.x,
            y: viewerPhys.position.y - distance.y,
        },
        {
            x: viewerPhys.position.x + distance.x,
            y: viewerPhys.position.y + distance.y,
        }
    ).contains(position);
}
