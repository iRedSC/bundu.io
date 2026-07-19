import {
    FOOTPRINT_CIRCLE_RADIUS,
    TILE_SIZE,
    WORLD_BOUNDS,
    WORLD_TILES,
    deciToWorld,
    worldToTile,
} from "@bundu/shared/tiles";
import {
    AdminPlaceKind,
    FREECAM_MAX_VIEW_EXTENT,
    type ServerPacket,
} from "@bundu/shared/packet_definitions";
import { Player } from "./objects/player";
import { Sky } from "./sky";
import { SkyUndoLayer } from "./sky_undo_layer";
import {
    collectShoreSamples,
    createGround,
    createOceanFillForType,
    GROUND_Z_BASE,
    GROUND_Z_OCEAN,
    groundModel,
    isOceanGroundModel,
    LandDistanceField,
    LandSeamBaker,
    LAND_SEAM_PER_TICK,
    LAND_SEAM_TICK_INTERVAL,
    NearshoreFill,
    type GroundVisual,
    type ShoreSample,
} from "./ground";
import { parseHexColor } from "@bundu/shared/ground_models";
import { createDecoration, type DecorationSprite } from "./decoration";
import {
    radians,
    structureOriginAtPoint,
    tileCenterWorld,
} from "@bundu/shared";
import { ANIMATION, AnimationManagers } from "../animation/animations";
import { TEXT_STYLE } from "../assets/text";
import { Point, Text, type Renderer } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import { Camera } from "@client/rendering/camera";
import { LayeredRenderer } from "@client/rendering/layered_renderer";
import type GameObject from "./game_object";
import ObjectContainer from "./object_container";
import { CombatFx } from "./combat_fx";
import { GameObjectData } from "@bundu/shared/object_types";
import type { EntityStateSnapshot } from "@bundu/shared/object_types";
import { Structure } from "./objects/structure";
import { GroundItem } from "./objects/ground_item";
import {
    clientDecoration,
    clientGroundType,
    clientRegistries,
    clientStructurePlacement,
    clientModelId,
} from "../configs/registries";
import { getVariantName } from "@bundu/shared/variant_map";
import {
    SpriteFactory,
    type ContaineredSprite,
} from "../assets/sprite_factory";
import { ParticleSystem } from "@client/rendering/particles/particle_system";
import type { ParticleBurst } from "../rendering/particles/types";
import {
    setActiveShadowLayer,
    ShadowLayer,
} from "@client/rendering/shadow_layer";
import { shadowStyle, type ShadowLight } from "../models/shadow";
import { updateOcclusion } from "./occlusion";
import { Animal } from "./objects/animal";
import { clientTime } from "@client/globals";
import { structurePlace } from "../models/particles/structure_place";

/**
 * Unload movers only when freecam can see most of the map.
 * (~80% of world half-extent — far beyond play render distance.)
 */
const FREECAM_OVERVIEW_HALF = WORLD_BOUNDS * 0.4;

type GroundPatch = {
    id: number;
    type: number;
    x: number;
    y: number;
    w: number;
    h: number;
    visual: GroundVisual;
};

type LoadPlayer = Extract<
    ServerPacket.LoadObject,
    { type: typeof GameObjectData.PlayerType }
>;
type LoadResource = Extract<
    ServerPacket.LoadObject,
    { type: typeof GameObjectData.ResourceNodeType }
>;
type LoadStructure = Extract<
    ServerPacket.LoadObject,
    { type: typeof GameObjectData.StructureType }
>;
type LoadGroundItem = Extract<
    ServerPacket.LoadObject,
    { type: typeof GameObjectData.GroundItemType }
>;
type LoadAnimal = Extract<ServerPacket.LoadObject, { type: typeof GameObjectData.AnimalType }>;

const PLACEMENT_GHOST_RENDER_ID = -11;
const GROUND_RENDER_ID = -10;
const DECORATION_RENDER_ID = -9;
const PLACEMENT_GHOST_TINT = 0xff5555;
const PLACEMENT_GHOST_NORMAL_TINT = 0xffffff;

/** Freecam delete-mode hover outline (world pixels). */
export type EditorDeleteHover =
    | { kind: "circle"; x: number; y: number; radius: number }
    | { kind: "rect"; x: number; y: number; w: number; h: number };

function deciPoint(x: number, y: number): Point {
    return new Point(deciToWorld(x), deciToWorld(y));
}

/** Client world scene — packet handlers land here after decode. */
export class World {
    viewport: Viewport;
    camera: Camera;
    user?: number;
    objects: ObjectContainer;
    combatFx: CombatFx;
    renderer: LayeredRenderer;
    private readonly pixi: Renderer;
    sky: Sky;
    skyUndo: SkyUndoLayer;
    shadows: ShadowLayer;
    particles: ParticleSystem;
    private placementGhost?: Structure;
    private placementInvalidOverlay?: ContaineredSprite;
    private placementGhostType = 0;
    private placementGhostAllowed?: boolean;
    private cursorWorld?: { x: number; y: number };
    /** Hold Tab: treat every structure as hovered for health bars. */
    private showAllHover = false;
    private readonly pendingObjectStates = new Map<number, EntityStateSnapshot>();
    /**
     * Client ground patches. Stack order / unload / delete-hover use entity `id`
     * (higher id on top) — same contract as server `topGroundAt` and map YAML.
     */
    private readonly groundPatches: GroundPatch[] = [];
    private oceanVisual?: GroundVisual;
    private shoreSamples: ShoreSample[] = [];
    private readonly landDistance = new LandDistanceField();
    private readonly nearshoreFill = new NearshoreFill();
    private readonly landSeamBaker = new LandSeamBaker();
    /** Frame counter for live seam bake pacing. */
    private landSeamFrame = 0;
    private oceanTypeIds = new Set<number>();
    /** Topmost-patch ocean mask (1 = ocean). Empty tiles stay 0. */
    private readonly oceanTiles = new Uint8Array(WORLD_TILES * WORLD_TILES);
    /** First ocean model color in the current stack (nearshore bake). */
    private oceanColor = 0x1a5f8a;
    /** True after at least one LoadGround/UnloadGround sync this session. */
    private groundSynced = false;
    /** Last idle / move wake spawn times per entity on water. */
    private readonly wakeIdleAt = new Map<number, number>();
    private readonly wakeMoveAt = new Map<number, number>();
    private readonly wakeSplashAt = new Map<number, number>();
    private readonly wakeLastPos = new Map<number, { x: number; y: number }>();
    private readonly wakeTravel = new Map<number, number>();
    /** Accumulated move delta since last splash — stabler heading than 1 frame. */
    private readonly wakeMoveDelta = new Map<number, { x: number; y: number }>();
    /** ms of continuous water-move — splash throw ramps with this. */
    private readonly wakeMoveAge = new Map<number, number>();
    private readonly decorations: DecorationSprite[] = [];
    /** Fired when server reports placement validity for the current ghost. */
    onPlacementValidity?: (allowed: boolean) => void;

    constructor(viewport: Viewport, pixiRenderer: Renderer) {
        this.viewport = viewport;
        this.camera = new Camera(viewport);
        this.pixi = pixiRenderer;
        this.sky = new Sky();
        this.skyUndo = new SkyUndoLayer(pixiRenderer);
        this.shadows = new ShadowLayer(this.viewport);
        setActiveShadowLayer(this.shadows);
        this.renderer = new LayeredRenderer(this.viewport);
        this.particles = new ParticleSystem(this.viewport);
        this.objects = new ObjectContainer();
        this.combatFx = new CombatFx(this.objects, this.particles);

        this.viewport.addChild(this.shadows.container);
        this.viewport.addChild(this.sky);
        this.viewport.addChild(this.skyUndo.sprite);
        this.viewport.sortChildren();
    }

    clear() {
        this.camera.setFreecam(false);
        this.camera.follow(null);

        const ids = Array.from(this.objects.all(), (object) => object.id);
        for (const id of ids) this.removeClientObject(id);
        this.renderer.delete(GROUND_RENDER_ID);
        this.oceanVisual = undefined;
        this.groundPatches.length = 0;
        this.oceanTypeIds.clear();
        this.oceanTiles.fill(0);
        this.shoreSamples = [];
        this.landSeamBaker.reset();
        this.groundSynced = false;
        this.wakeIdleAt.clear();
        this.wakeMoveAt.clear();
        this.wakeSplashAt.clear();
        this.wakeLastPos.clear();
        this.wakeTravel.clear();
        this.wakeMoveDelta.clear();
        this.wakeMoveAge.clear();
        this.renderer.delete(DECORATION_RENDER_ID);
        this.decorations.length = 0;
        this.shadows.clear();
        this.particles.clear();
        this.clearPlacementGhost();
        this.cursorWorld = undefined;
        this.showAllHover = false;
        this.pendingObjectStates.clear();
        this.user = undefined;
    }

    destroy(): void {
        this.clear();
        this.particles.destroy();
        setActiveShadowLayer(undefined);
        this.shadows.destroy();
        this.skyUndo.sprite.removeFromParent();
        this.skyUndo.destroy();
        this.sky.removeFromParent();
        this.sky.destroy();
    }

    tick(deltaMS: number, now = clientTime.now()) {
        AnimationManagers.World.update(now);
        this.objects.update(now);
        for (const object of this.objects.all()) {
            if (object instanceof Structure) {
                object.tickVisual(now);
            }
        }
        this.syncSkyUndo();
        this.syncShadowLights();
        const localPlayer =
            this.user !== undefined ? this.objects.get(this.user) : undefined;
        updateOcclusion(localPlayer, this.objects.all());
        for (const object of this.objects.all()) {
            if (object instanceof Structure) {
                object.updateHealthBar(now, this.cursorWorld, this.showAllHover);
            }
        }
        this.particles.update(deltaMS);
        this.tickLandSeams();
        this.updateGroundVisuals(deltaMS, now);
        this.updatePlacementGhost();
        this.camera.update();
        if (this.camera.isFreecam()) {
            if (this.onViewBounds) {
                const bounds = this.currentViewBounds();
                const key = `${bounds.minX | 0},${bounds.minY | 0},${bounds.maxX | 0},${bounds.maxY | 0},${bounds.overview ? 1 : 0}`;
                if (key !== this.lastViewBoundsKey) {
                    this.lastViewBoundsKey = key;
                    this.onViewBounds(bounds);
                }
            }
        }
    }

    private syncSkyUndo(): void {
        const discs = [];
        for (const object of this.objects.all()) {
            if (object instanceof Structure) {
                discs.push(...object.skyHoles());
            }
        }
        this.skyUndo.sync(discs, this.sky.tint);
    }

    /** Feed configured light structures into the batched shadow layer. */
    private syncShadowLights(): void {
        const { sources } = shadowStyle.lights;
        const lights: ShadowLight[] = [];
        for (const object of this.objects.all()) {
            if (!(object instanceof Structure)) continue;
            const intensity = sources[object.type];
            if (intensity === undefined) continue;
            lights.push({
                x: object.position.x,
                y: object.position.y,
                intensity,
            });
        }
        this.shadows.setLights(lights);
        const bounds = this.viewport.getVisibleBounds();
        this.shadows.setView(bounds.x, bounds.y, bounds.width, bounds.height);
    }

    setCursorWorld(position: { x: number; y: number }) {
        this.cursorWorld = position;
    }

    setShowAllHover(show: boolean) {
        this.showAllHover = show;
    }

    private attachLocalPlayer(player: GameObject) {
        console.info(`Found user (id ${player.id}), loading..`);
        if (!this.camera.isFreecam()) {
            this.camera.follow(player.container);
        }
        this.refreshStructureOwnership();
    }

    /**
     * Enter/exit freecam spectate mode: detach camera, hide the local avatar.
     */
    setFreecamMode(enabled: boolean): void {
        this.camera.setFreecam(enabled);
        const local =
            this.user !== undefined ? this.objects.get(this.user) : undefined;
        if (local) {
            local.container.visible = !enabled;
            if (local instanceof Player) {
                local.name.visible = !enabled;
                local.chatMessage.visible = !enabled && local.chatMessage.visible;
                local.craftBar.visible = !enabled && local.craftBar.visible;
            }
            if (!enabled) {
                this.camera.follow(local.container);
            }
        }
        this.lastViewBoundsKey = "";
    }

    /** World AABB for freecam AOI; overview when larger than play render distance. */
    currentViewBounds(): {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
        overview: boolean;
    } {
        const bounds = this.camera.worldBounds();
        let { minX, minY, maxX, maxY } = bounds;
        const width = maxX - minX;
        const height = maxY - minY;
        // Clamp to wire limit (keeps packets valid at extreme freecam zoom).
        if (width > FREECAM_MAX_VIEW_EXTENT) {
            const cx = (minX + maxX) / 2;
            const half = FREECAM_MAX_VIEW_EXTENT / 2;
            minX = cx - half;
            maxX = cx + half;
        }
        if (height > FREECAM_MAX_VIEW_EXTENT) {
            const cy = (minY + maxY) / 2;
            const half = FREECAM_MAX_VIEW_EXTENT / 2;
            minY = cy - half;
            maxY = cy + half;
        }
        const halfX = (maxX - minX) / 2;
        const halfY = (maxY - minY) / 2;
        return {
            minX,
            minY,
            maxX,
            maxY,
            overview: halfX > FREECAM_OVERVIEW_HALF || halfY > FREECAM_OVERVIEW_HALF,
        };
    }

    private lastViewBoundsKey = "";
    /** Optional sink for throttled ViewBounds while freecam is on. */
    onViewBounds?: (bounds: {
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
        overview: boolean;
    }) => void;

    /** Tint owned structure health bars once the local player id is known. */
    private refreshStructureOwnership() {
        for (const object of this.objects.all()) {
            if (object instanceof Structure) {
                object.setLocalPlayerId(this.user);
            }
        }
    }

    clientConnectionInfo = (packet?: ServerPacket.ClientConnectionInfo) => {
        if (packet) {
            this.user = packet.playerId;
        }
        if (!this.user) return;

        const player = this.objects.get(this.user);
        if (!player) {
            console.warn(
                `No player with id ${this.user} found in world, waiting for load..`
            );
            return;
        }
        this.attachLocalPlayer(player);
    };

    loadObject = (packet: ServerPacket.LoadObject) => {
        switch (packet.type) {
            case GameObjectData.PlayerType:
                this.newPlayer(packet);
                break;
            case GameObjectData.ResourceNodeType:
                this.newResource(packet);
                break;
            case GameObjectData.StructureType:
                this.newStructure(packet);
                break;
            case GameObjectData.GroundItemType:
                this.newGroundItem(packet);
                break;
            case GameObjectData.AnimalType:
                this.newAnimal(packet);
                break;
        }
    };

    newPlayer = (packet: LoadPlayer) => {
        const [
            name,
            mainhand,
            offhand,
            helmet,
            backpack,
            playerSkin,
            collisionRadius,
            scale,
        ] = packet.data;
        const id = packet.id;
        this.removeClientObject(id);

        const pos = deciPoint(packet.x, packet.y);
        const nameText = new Text(name, TEXT_STYLE);

        const player = new Player(
            id,
            AnimationManagers.World,
            nameText,
            pos,
            radians(packet.rotation),
            collisionRadius,
            scale,
            getVariantName(playerSkin ?? undefined)
        );

        player.setEquipment({ mainhand, offhand, helmet, backpack });
        player.enableParticles((burst) => this.particles.burst(burst));
        this.objects.add(player);
        this.renderer.add(player.id, ...player.containers);

        if (id === this.user) {
            this.attachLocalPlayer(player);
        }
    };

    newResource = (packet: LoadResource) => {
        const [nodeType, variantId, collisionRadius, scale] = packet.data;
        this.removeClientObject(packet.id);

        const structure = new Structure(
            packet.id,
            clientModelId(clientRegistries().resource.location(nodeType)),
            deciPoint(packet.x, packet.y),
            packet.rotation,
            typeof collisionRadius === "number"
                ? collisionRadius
                : FOOTPRINT_CIRCLE_RADIUS,
            AnimationManagers.World,
            typeof scale === "number" ? TILE_SIZE * scale : TILE_SIZE,
            getVariantName(variantId)
        );
        structure.placeKind = AdminPlaceKind.Resource;
        this.registerStructure(structure);
    };

    newStructure = (packet: LoadStructure) => {
        const [nodeType, variantId, health, maxHealth, initialStates] =
            packet.data;
        const pendingStates = this.pendingObjectStates.get(packet.id);
        this.removeClientObject(packet.id);
        const states = pendingStates
            ? { ...initialStates, ...pendingStates }
            : initialStates;

        const structure = new Structure(
            packet.id,
            clientModelId(clientRegistries().structure.location(nodeType)),
            deciPoint(packet.x, packet.y),
            packet.rotation,
            FOOTPRINT_CIRCLE_RADIUS,
            AnimationManagers.World,
            TILE_SIZE,
            getVariantName(variantId),
            health,
            maxHealth,
            states ?? {}
        );
        this.registerStructure(structure);
        structure.trigger(ANIMATION.PLACE, AnimationManagers.World, true);
        this.particles.burst(
            structurePlace(
                structure.sprite.sprite.texture,
                structure.position.x,
                structure.position.y
            )
        );
    };

    updateObjectHealth = (
        packet: ServerPacket.UpdateObjectHealth,
        _serverTimestamp: number
    ) => {
        const object = this.objects.get(packet.id);
        if (object instanceof Structure) {
            // Hold duration must use receive time — fromServer(sendTime) can
            // already be past `now`, so the bar would hide on the next tick.
            object.setHealth(
                packet.health,
                packet.maxHealth,
                clientTime.now()
            );
        }
    };

    setStructureState = (packet: ServerPacket.SetStructureState) => {
        const object = this.objects.get(packet.id);
        if (object instanceof Structure) {
            object.applyStates(packet.states);
            object.setLocalPlayerId(this.user);
            return;
        }
        if (object) return;

        const pending = this.pendingObjectStates.get(packet.id) ?? {};
        this.pendingObjectStates.set(packet.id, {
            ...pending,
            ...packet.states,
        });
    };

    moveObject = (packet: ServerPacket.SetPosition, _serverTimestamp: number) => {
        const object = this.objects.get(packet.id);
        if (!object) return;
        object.renderable = true;
        // Receive-time segment start — send-time makes t≈1 on arrival (choppy).
        object.addPosition({
            x: deciToWorld(packet.x),
            y: deciToWorld(packet.y),
        });
        this.objects.updating.add(object);
        this.objects.add(object);
    };

    rotateObject = (
        packet: ServerPacket.SetRotation,
        _serverTimestamp: number
    ) => {
        if (packet.id === this.user) return;
        const object = this.objects.get(packet.id);
        if (!object) return;
        object.addRotation(radians(packet.rotation));
        this.objects.updating.add(object);
    };

    deleteObjects = ({ objects }: ServerPacket.DeleteObjects) => {
        for (const id of objects) {
            this.removeClientObject(id);
        }
    };

    private removeClientObject(id: number): void {
        this.pendingObjectStates.delete(id);
        const object = this.objects.get(id);
        if (object) {
            this.objects.delete(object);
            object.dispose();
        }
        this.renderer.delete(id);
    }

    private registerStructure(structure: Structure): void {
        structure.setLocalPlayerId(this.user);
        structure.enableParticles((burst) => this.particles.burst(burst));
        this.objects.add(structure);
        this.renderer.add(structure.id, ...structure.containers);
    }

    updateEquipment = (packet: ServerPacket.UpdateEquipment) => {
        const player = this.objects.get(packet.id);
        if (player instanceof Player) {
            player.setEquipment(packet);
        }
    };

    selectStructure = (packet: ServerPacket.SetSelectedStructure) => {
        const player = this.objects.get(this.user || -1);
        if (player instanceof Player) {
            player.setSelectedStructure(packet.structureId);
            this.updatePlacementGhost();
        }
    };

    newGroundItem = (packet: LoadGroundItem) => {
        this.removeClientObject(packet.id);

        const item = new GroundItem(
            packet.id,
            packet.data[0],
            deciPoint(packet.x, packet.y),
            packet.rotation
        );
        this.objects.add(item);
        this.renderer.add(item.id, ...item.containers);
    };

    newAnimal = (packet: LoadAnimal) => {
        this.removeClientObject(packet.id);
        const [type, collisionRadius, , , scale] = packet.data;
        const animal = new Animal(
            packet.id,
            type,
            deciPoint(packet.x, packet.y),
            collisionRadius,
            scale
        );
        this.objects.add(animal);
        this.renderer.add(animal.id, ...animal.containers);
    };

    dropItem = (packet: ServerPacket.DropItem) => {
        const source = this.objects.get(packet.id);
        if (!source) return;

        const target = deciPoint(packet.x, packet.y);
        const existing = this.objects.get(packet.objectId);
        const item =
            existing instanceof GroundItem
                ? existing
                : new GroundItem(
                packet.objectId,
                packet.itemId,
                source.position.clone(),
                source.rotation * (180 / Math.PI)
            );
        if (!(existing instanceof GroundItem)) {
            this.objects.add(item);
            this.renderer.add(item.id, ...item.containers);
        }
        item.popFrom(source.position.clone(), target);
        this.objects.updating.add(item);
    };

    placeStructureResult = (packet: ServerPacket.PlaceStructureResult) => {
        if (this.placementGhost) {
            this.placementGhost.setGhostAppearance(
                0.5,
                packet.allowed
                    ? PLACEMENT_GHOST_NORMAL_TINT
                    : PLACEMENT_GHOST_TINT
            );
            if (this.placementInvalidOverlay) {
                this.placementInvalidOverlay.renderable = !packet.allowed;
            }
            this.placementGhostAllowed = packet.allowed;
        }

        this.onPlacementValidity?.(packet.allowed);
    };

    /** Whether the ghost's last server result allows placement. */
    isPlacementAllowed(): boolean | undefined {
        return this.placementGhostAllowed;
    }

    refreshPlacementGhost() {
        this.placementGhostType = 0;
        this.updatePlacementGhost();
    }

    private updatePlacementGhost() {
        if (this.camera.isFreecam()) {
            this.clearPlacementGhost();
            return;
        }
        const player = this.objects.get(this.user ?? -1);
        const placement =
            player instanceof Player ? player.getStructureGhost() : null;
        if (!(player instanceof Player) || !placement) {
            this.clearPlacementGhost();
            return;
        }

        if (!this.placementGhost || this.placementGhostType !== placement.id) {
            this.clearPlacementGhost();
            this.placementGhost = new Structure(
                PLACEMENT_GHOST_RENDER_ID,
                clientModelId(
                    clientRegistries().structure.location(placement.id)
                ),
                new Point(),
                placement.rotation * 90,
                FOOTPRINT_CIRCLE_RADIUS,
                AnimationManagers.World,
                TILE_SIZE
            );
            this.placementGhost.setGhostAppearance(
                0.5,
                PLACEMENT_GHOST_NORMAL_TINT
            );
            this.placementGhost.container.eventMode = "none";
            this.placementGhostAllowed = undefined;
            this.placementInvalidOverlay = SpriteFactory.build(
                "bundu/ui/invalid_placement.png"
            );
            this.placementInvalidOverlay.anchor.set(0.5);
            this.placementInvalidOverlay.alpha = 0.5;
            this.placementInvalidOverlay.renderable = false;
            this.placementInvalidOverlay.zIndex = 100;
            this.placementGhost.addSyncedOverlay(this.placementInvalidOverlay);
            this.placementGhostType = placement.id;
            this.renderer.add(
                PLACEMENT_GHOST_RENDER_ID,
                ...this.placementGhost.containers
            );
        }

        const def = clientStructurePlacement(placement.id);
        const origin = structureOriginAtPoint(
            placement.cursor,
            def.blocked,
            placement.rotation
        );
        this.placementGhost.position.set(
            tileCenterWorld(origin.x),
            tileCenterWorld(origin.y)
        );
        this.placementGhost.rotation = radians(placement.rotation * 90);
        this.placementGhost.syncWorldLayers();
    }

    private clearPlacementGhost() {
        if (!this.placementGhost) return;
        this.placementGhost.dispose();
        this.renderer.delete(PLACEMENT_GHOST_RENDER_ID);
        this.placementGhost = undefined;
        this.placementInvalidOverlay = undefined;
        this.placementGhostType = 0;
        this.placementGhostAllowed = undefined;
    }

    /** Rebind an object's display list after visuals are rebuilt in place. */
    reregisterObject(object: GameObject) {
        this.renderer.replace(object.id, ...object.containers);
    }

    loadGround = (packet: ServerPacket.LoadGround) => {
        for (const [id, type, x, y, w, h] of packet.groundData) {
            // Resync / undo restore: replace any prior gfx for this entity id.
            for (let i = this.groundPatches.length - 1; i >= 0; i--) {
                const existing = this.groundPatches[i];
                if (!existing || existing.id !== id) continue;
                this.groundPatches.splice(i, 1);
                this.renderer.remove(
                    GROUND_RENDER_ID,
                    existing.visual.container
                );
                break;
            }
            const modelId = clientGroundType(type).model;
            const ocean = isOceanGroundModel(modelId);
            const visual = ocean
                ? createOceanFillForType(
                      type,
                      x * TILE_SIZE,
                      y * TILE_SIZE,
                      w * TILE_SIZE,
                      h * TILE_SIZE
                  )
                : createGround(
                      type,
                      x * TILE_SIZE,
                      y * TILE_SIZE,
                      w * TILE_SIZE,
                      h * TILE_SIZE,
                      GROUND_Z_BASE + id
                  );
            if (ocean) this.ensureOceanVisual(type);
            this.groundPatches.push({ id, type, x, y, w, h, visual });
            this.renderer.add(GROUND_RENDER_ID, visual.container);
        }
        this.groundSynced = true;
        this.rebuildShoreSamples();
    };

    unloadGround = (packet: ServerPacket.UnloadGround) => {
        for (const [id] of packet.groundData) {
            for (let i = this.groundPatches.length - 1; i >= 0; i--) {
                const patch = this.groundPatches[i];
                if (!patch || patch.id !== id) continue;
                this.groundPatches.splice(i, 1);
                this.renderer.remove(
                    GROUND_RENDER_ID,
                    patch.visual.container
                );
                break;
            }
        }
        this.groundSynced = true;
        this.rebuildShoreSamples();
    };

    private ensureOceanVisual(type: number): GroundVisual {
        if (this.oceanVisual) return this.oceanVisual;
        this.oceanVisual = createGround(
            type,
            0,
            0,
            WORLD_BOUNDS,
            WORLD_BOUNDS,
            GROUND_Z_OCEAN
        );
        this.renderer.add(
            GROUND_RENDER_ID,
            this.oceanVisual.container,
            ...(this.oceanVisual.overlay ? [this.oceanVisual.overlay] : [])
        );
        return this.oceanVisual;
    }

    private rebuildShoreSamples(): void {
        this.oceanTypeIds.clear();
        this.oceanTiles.fill(0);
        let oceanColor: number | undefined;
        const byBottom = [...this.groundPatches].sort((a, b) => a.id - b.id);
        for (const patch of byBottom) {
            const modelId = clientGroundType(patch.type).model;
            const ocean = isOceanGroundModel(modelId);
            if (ocean) {
                this.oceanTypeIds.add(patch.type);
                oceanColor ??= parseHexColor(groundModel(modelId).color);
            }
            const x1 = Math.max(0, patch.x);
            const y1 = Math.max(0, patch.y);
            const x2 = Math.min(WORLD_TILES, patch.x + patch.w);
            const y2 = Math.min(WORLD_TILES, patch.y + patch.h);
            const bit = ocean ? 1 : 0;
            for (let ty = y1; ty < y2; ty++) {
                const row = ty * WORLD_TILES;
                for (let tx = x1; tx < x2; tx++) {
                    this.oceanTiles[row + tx] = bit;
                }
            }
        }
        if (oceanColor !== undefined) this.oceanColor = oceanColor;
        if (this.oceanTypeIds.size === 0 && this.oceanVisual) {
            this.renderer.remove(
                GROUND_RENDER_ID,
                this.oceanVisual.container
            );
            if (this.oceanVisual.overlay) {
                this.renderer.remove(
                    GROUND_RENDER_ID,
                    this.oceanVisual.overlay
                );
            }
            this.oceanVisual = undefined;
        }
        const isOcean = (type: number) => this.oceanTypeIds.has(type);
        const colorOfType = (type: number) =>
            parseHexColor(groundModel(clientGroundType(type).model).color);
        this.shoreSamples = collectShoreSamples(this.groundPatches, isOcean);
        this.landDistance.rebuild(this.groundPatches, isOcean, colorOfType);
        this.nearshoreFill.setOceanColor(this.oceanColor);
        this.nearshoreFill.paint(this.landDistance);
        // Unbind before prepare destroys textures — Pixi crashes on null alphaMode
        // if sprites still reference destroyed sources.
        for (const patch of this.groundPatches) {
            patch.visual.clearLandSeam?.();
        }
        this.landSeamBaker.prepare(this.groundPatches, isOcean, colorOfType);
        this.landSeamFrame = 0;
    }

    /** Bake a few per-patch land seams each frame (spread load, sharper edges). */
    private tickLandSeams(limit?: number): void {
        if (this.landSeamBaker.pending === 0) return;
        // Live: one patch every few frames. Loading flush passes an explicit limit.
        if (limit === undefined) {
            this.landSeamFrame++;
            if (this.landSeamFrame % LAND_SEAM_TICK_INTERVAL !== 0) return;
            limit = LAND_SEAM_PER_TICK;
        }
        const baked = this.landSeamBaker.tick(limit);
        if (baked.length === 0) return;
        const byId = new Map(
            this.groundPatches.map((patch) => [patch.id, patch])
        );
        for (const { id, texture } of baked) {
            byId.get(id)?.visual.applyLandSeam?.(texture);
        }
    }

    /** Land-seam bake progress after the latest ground rebuild. */
    landSeamProgress(): { done: number; total: number; pending: number } {
        const { done, total } = this.landSeamBaker.progress;
        return { done, total, pending: this.landSeamBaker.pending };
    }

    /** True once the server has sent at least one ground sync this session. */
    hasGroundSync(): boolean {
        return this.groundSynced;
    }

    /**
     * Bake several seam patches now (loading screen). Returns true when idle.
     */
    flushLandSeams(limit = 6): boolean {
        this.tickLandSeams(limit);
        return this.landSeamBaker.pending === 0;
    }

    private updateGroundVisuals(deltaMS: number, now: number): void {
        if (this.oceanTypeIds.size === 0) return;

        const bounds = this.viewport.getVisibleBounds();
        const oceanTiles = this.oceanTiles;
        const isOceanAt = (worldX: number, worldY: number) => {
            const tx = (worldX / TILE_SIZE) | 0;
            const ty = (worldY / TILE_SIZE) | 0;
            if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) {
                return false;
            }
            return oceanTiles[ty * WORLD_TILES + tx] === 1;
        };
        const oceanVisualAt = (worldX: number, worldY: number) => {
            return isOceanAt(worldX, worldY)
                ? this.oceanVisual
                : undefined;
        };

        this.spawnWakeRipples(deltaMS, now, isOceanAt, oceanVisualAt);

        const ctx = {
            deltaMS,
            now,
            view: {
                minX: bounds.x,
                minY: bounds.y,
                maxX: bounds.x + bounds.width,
                maxY: bounds.y + bounds.height,
            },
            renderer: this.pixi,
            emitParticles: (burst: ParticleBurst) => this.particles.burst(burst),
            shore: this.shoreSamples,
            isOceanAt,
            landDistanceAt: (wx: number, wy: number) =>
                this.landDistance.atWorld(wx, wy),
            shoreColor: this.nearshoreFill.colorTexture,
            shoreMask: this.nearshoreFill.maskTexture,
        };
        this.oceanVisual?.update?.(ctx);
        for (const patch of this.groundPatches) patch.visual.update?.(ctx);
    }

    /**
     * Idle ripples for anything on ocean (players, animals, resources,
     * structures/floors). Moving actors also disturb the displacement map.
     */
    private spawnWakeRipples(
        deltaMS: number,
        now: number,
        isOceanAt: (x: number, y: number) => boolean,
        oceanVisualAt: (x: number, y: number) => GroundVisual | undefined
    ): void {
        const IDLE_INTERVAL = 2000;
        const MOVE_INTERVAL = 280;
        const SPLASH_INTERVAL = 90;
        const MOVE_MIN = 8;
        const SPLASH_RAMP_MS = 550;
        const dt = Math.max(1, deltaMS) / 1000;

        const takeIdlePulse = (id: number): boolean => {
            let last = this.wakeIdleAt.get(id);
            if (last === undefined) {
                // Phase-offset by id so nearby objects don't all pulse together.
                last = now - ((id * 7919) % IDLE_INTERVAL);
                this.wakeIdleAt.set(id, last);
            }
            if (now - last < IDLE_INTERVAL) return false;
            this.wakeIdleAt.set(id, now);
            return true;
        };

        for (const object of this.objects.all()) {
            const { x, y } = object.position;
            if (!isOceanAt(x, y)) {
                // Re-entry must start from a fresh position sample. Keeping the
                // last wet position turns time spent on land into one huge step.
                this.wakeLastPos.delete(object.id);
                this.wakeTravel.set(object.id, 0);
                this.wakeSplashAt.delete(object.id);
                this.wakeMoveDelta.set(object.id, { x: 0, y: 0 });
                this.wakeMoveAge.set(object.id, 0);
                continue;
            }

            const visual = oceanVisualAt(x, y);
            if (!visual?.addWakeRipple) continue;

            // Resources / structures (incl. floors) — idle pulse only.
            if (object instanceof Structure) {
                if (takeIdlePulse(object.id)) {
                    visual.addWakeRipple(x, y, now, "idle");
                }
                continue;
            }

            if (!(object instanceof Player || object instanceof Animal)) {
                continue;
            }

            const prev = this.wakeLastPos.get(object.id);
            this.wakeLastPos.set(object.id, { x, y });

            if (takeIdlePulse(object.id)) {
                visual.addWakeRipple(x, y, now, "idle");
            }

            if (!prev) continue;
            const stepX = x - prev.x;
            const stepY = y - prev.y;
            const step = Math.hypot(stepX, stepY);
            if (step < 0.5) {
                this.wakeMoveAge.set(object.id, 0);
                continue;
            }

            const moveAge =
                (this.wakeMoveAge.get(object.id) ?? 0) + deltaMS;
            this.wakeMoveAge.set(object.id, moveAge);

            const delta = this.wakeMoveDelta.get(object.id) ?? { x: 0, y: 0 };
            delta.x += stepX;
            delta.y += stepY;
            this.wakeMoveDelta.set(object.id, delta);

            const travel = (this.wakeTravel.get(object.id) ?? 0) + step;
            this.wakeTravel.set(object.id, travel);

            const lastSplash = this.wakeSplashAt.get(object.id) ?? 0;
            if (now - lastSplash >= SPLASH_INTERVAL) {
                this.wakeSplashAt.set(object.id, now);
                const direction = Math.atan2(delta.y, delta.x);
                const moverSpeed = step / dt;
                const ramp = Math.min(1, moveAge / SPLASH_RAMP_MS);
                const rampEase = ramp * ramp * (3 - 2 * ramp);
                const throwSpeed = moverSpeed * (0.35 + 0.65 * rampEase);
                this.wakeMoveDelta.set(object.id, { x: 0, y: 0 });
                const ahead =
                    8 +
                    object.collisionRadius * 0.2 +
                    (8 + object.collisionRadius * 0.15) * rampEase;
                visual.addSplashDisplacement?.(
                    x + Math.cos(direction) * ahead,
                    y + Math.sin(direction) * ahead,
                    now,
                    direction,
                    throwSpeed
                );
            }

            if (travel < MOVE_MIN) continue;
            const lastMove = this.wakeMoveAt.get(object.id) ?? 0;
            if (now - lastMove < MOVE_INTERVAL) continue;
            this.wakeMoveAt.set(object.id, now);
            this.wakeTravel.set(object.id, 0);
            this.wakeMoveDelta.set(object.id, { x: 0, y: 0 });
            visual.addWakeRipple(x, y, now, "move");
        }
    }

    loadDecorations = (packet: ServerPacket.LoadDecorations) => {
        for (const [id, type, x, y, rotation, scale] of packet.decorations) {
            for (let i = this.decorations.length - 1; i >= 0; i--) {
                const existing = this.decorations[i];
                if (!existing || existing.id !== id) continue;
                this.decorations.splice(i, 1);
                this.renderer.remove(DECORATION_RENDER_ID, existing.container);
                break;
            }
            const sprite = createDecoration(id, type, x, y, rotation, scale);
            this.decorations.push(sprite);
            this.renderer.add(DECORATION_RENDER_ID, sprite.container);
        }
    };

    unloadDecorations = (packet: ServerPacket.UnloadDecorations) => {
        for (const [id] of packet.decorations) {
            for (let i = this.decorations.length - 1; i >= 0; i--) {
                const entry = this.decorations[i];
                if (!entry || entry.id !== id) continue;
                this.decorations.splice(i, 1);
                this.renderer.remove(DECORATION_RENDER_ID, entry.container);
                break;
            }
        }
    };

    /**
     * What AdminDeleteAt would hit under a world point — for delete-mode hover.
     * Scoped to `kind` (active palette tab), matching server.
     */
    pickEditorDeleteHover(
        worldX: number,
        worldY: number,
        kind: AdminPlaceKind
    ): EditorDeleteHover | null {
        const tx = worldToTile(worldX);
        const ty = worldToTile(worldY);

        switch (kind) {
            case AdminPlaceKind.Resource:
            case AdminPlaceKind.Structure: {
                for (const object of this.objects.all()) {
                    if (!(object instanceof Structure)) continue;
                    if (object.placeKind !== kind) continue;
                    if (
                        worldToTile(object.position.x) !== tx ||
                        worldToTile(object.position.y) !== ty
                    ) {
                        continue;
                    }
                    return {
                        kind: "circle",
                        x: object.position.x,
                        y: object.position.y,
                        radius: Math.max(object.collisionRadius, TILE_SIZE / 2),
                    };
                }
                return null;
            }
            case AdminPlaceKind.Decoration: {
                let topDecoration: DecorationSprite | undefined;
                let topZ = -Infinity;
                for (const entry of this.decorations) {
                    const config = clientDecoration(entry.type);
                    const radius = (config.size * entry.scale) / 2;
                    const dx = entry.x - worldX;
                    const dy = entry.y - worldY;
                    if (dx * dx + dy * dy > radius * radius) continue;
                    if (
                        config.z > topZ ||
                        (config.z === topZ &&
                            (!topDecoration || entry.id > topDecoration.id))
                    ) {
                        topDecoration = entry;
                        topZ = config.z;
                    }
                }
                if (!topDecoration) return null;
                const config = clientDecoration(topDecoration.type);
                return {
                    kind: "circle",
                    x: topDecoration.x,
                    y: topDecoration.y,
                    radius: (config.size * topDecoration.scale) / 2,
                };
            }
            case AdminPlaceKind.Ground: {
                let top: (typeof this.groundPatches)[number] | undefined;
                for (const patch of this.groundPatches) {
                    if (patch.w >= WORLD_TILES && patch.h >= WORLD_TILES) continue;
                    if (
                        tx < patch.x ||
                        ty < patch.y ||
                        tx >= patch.x + patch.w ||
                        ty >= patch.y + patch.h
                    ) {
                        continue;
                    }
                    if (!top || patch.id > top.id) top = patch;
                }
                if (!top) return null;
                return {
                    kind: "rect",
                    x: top.x * TILE_SIZE,
                    y: top.y * TILE_SIZE,
                    w: top.w * TILE_SIZE,
                    h: top.h * TILE_SIZE,
                };
            }
        }
    }

    chatMessage = ({ id, message }: ServerPacket.ChatMessage) => {
        const player = this.objects.get(id);
        if (!(player instanceof Player)) return;
        player.showChatMessage(message);
    };

    craftEvent = (
        { id, duration, recipeId }: ServerPacket.CraftEvent,
        serverTimestamp: number
    ) => {
        const player = this.objects.get(id);
        if (!(player instanceof Player)) return;
        player.setCraftProgress(
            duration,
            recipeId,
            clientTime.fromServer(serverTimestamp)
        );
        if (duration > 0) this.objects.updating.add(player);
    };
}
