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
import { modelIdForLocation } from "@bundu/shared/models/ids";
import { Sky } from "./sky";
import { SkyUndoLayer } from "./sky_undo_layer";
import {
    collectShoreSamples,
    createGround,
    createOceanFillForType,
    GROUND_Z_BASE,
    GROUND_Z_OCEAN,
    GROUND_Z_OCEAN_FILL,
    GROUND_Z_SURFACE_WATER,
    groundModel,
    isOceanGroundModel,
    LandDistanceField,
    LandSeamBaker,
    LAND_SEAM_PER_TICK,
    LAND_SEAM_TICK_INTERVAL,
    NearshoreFill,
    oceanGroundModel,
    seamLodFromZoom,
    solidGroundModel,
    waterFxProfileKey,
    type GroundVisual,
    type SeamLod,
    type ShoreSample,
} from "./ground";
import {
    DEFAULT_OCEAN_FADE_TILES,
    DEFAULT_WATER_WATER_FADE_TILES,
    parseHexColor,
    type SolidGroundFill,
} from "@bundu/shared/ground_models";
import type { ModelFootstepsDef } from "@bundu/shared/models/types";
import { toSanitizedTexturePath } from "@bundu/shared/models/texture_paths";
import { AmbientParticles } from "./ground/particles/ambient";
import { softCircleTexture } from "./ground/particles/circle";
import { landFootstep } from "./ground/particles/footsteps";
import { landTrailBursts } from "./ground/particles/trail";
import { createDecoration, type DecorationSprite } from "./decoration";
import {
    radians,
    structureOriginAtPoint,
    tileCenterWorld,
} from "@bundu/shared";
import { ANIMATION, AnimationManagers } from "../animation/animations";
import { TEXT_STYLE } from "../assets/text";
import { getAsset } from "../assets/load";
import { animalDef, playerDef } from "../models/defs";
import {
    Point,
    Rectangle,
    Text,
    type Container,
    type Renderer,
    type Texture,
} from "pixi.js";
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
import { FreecamGhost } from "./objects/freecam_ghost";
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

/** Actor model footsteps, or undefined when disabled / unset. */
function actorFootsteps(
    object: Player | Animal
): ModelFootstepsDef | undefined {
    const raw =
        object instanceof Player
            ? playerDef.footsteps
            : animalDef(object.modelId).footsteps;
    if (!raw) return undefined;
    return raw;
}

function footstepTexture(
    config: ModelFootstepsDef,
    fallback: Texture
): { texture: Texture; tint: number } {
    if (!config.texture) return { texture: fallback, tint: 0x1a1a1a };
    return {
        texture: getAsset(toSanitizedTexturePath(config.texture)),
        tint: 0xffffff,
    };
}

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
type LoadFreecamGhost = Extract<
    ServerPacket.LoadObject,
    { type: typeof GameObjectData.FreecamGhostType }
>;

const PLACEMENT_GHOST_RENDER_ID = -11;

/** Player death corpse resource (`bundu:player_dead`). */
function isPlayerCorpseType(nodeType: LoadResource["data"][0]): boolean {
    try {
        return clientRegistries()
            .resource.location(nodeType)
            .endsWith(":player_dead");
    } catch {
        return false;
    }
}
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
    /** One FX stack per ocean-kind ground model (ocean, pond, …). */
    private readonly oceanVisuals = new Map<string, GroundVisual>();
    private shoreSamples: ShoreSample[] = [];
    private readonly landDistance = new LandDistanceField();
    private readonly nearshoreFill = new NearshoreFill();
    private readonly landSeamBaker = new LandSeamBaker();
    /** Frame counter for live seam bake pacing. */
    private landSeamFrame = 0;
    private oceanTypeIds = new Set<number>();
    /** Topmost-patch ocean mask (1 = ocean). Empty tiles stay 0. */
    private readonly oceanTiles = new Uint8Array(WORLD_TILES * WORLD_TILES);
    /** Topmost ground type id per tile (0 = empty). Registry ids start at 1. */
    private readonly topGroundTypes = new Uint16Array(WORLD_TILES * WORLD_TILES);
    /** Fallback water color when a tile's type is unknown. */
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
    /** Land footsteps / trail tracking (mirrors wake travel sampling). */
    private readonly landFxLastPos = new Map<number, { x: number; y: number }>();
    private readonly landFxFootAt = new Map<number, number>();
    private readonly landFxTrailTravel = new Map<number, number>();
    private readonly landFxFootStep = new Map<number, number>();
    private readonly decorations: DecorationSprite[] = [];
    private readonly ambientParticles = new AmbientParticles();
    /** Fired when server reports placement validity for the current ghost. */
    onPlacementValidity?: (allowed: boolean) => void;
    /** True after local death — keep avatar, skip corpse for the game-over capture. */
    private deathCinematic = false;
    /** Local drop origins (world space) queued until DropItem arrives. */
    private pendingLocalDrops: { origin: Point; startScale: number }[] = [];

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
        this.deathCinematic = false;

        // Pull the air ring off ocean FX before objects / water are torn down.
        this.detachLocalAirRingFromOcean();

        const ids = Array.from(this.objects.all(), (object) => object.id);
        for (const id of ids) this.removeClientObject(id);
        for (const patch of this.groundPatches) {
            this.disposeGroundVisual(patch.visual);
        }
        if (this.oceanVisuals.size > 0) {
            for (const visual of this.oceanVisuals.values()) {
                this.disposeGroundVisual(visual);
            }
        }
        this.renderer.delete(GROUND_RENDER_ID);
        this.oceanVisuals.clear();
        this.groundPatches.length = 0;
        this.oceanTypeIds.clear();
        this.oceanTiles.fill(0);
        this.topGroundTypes.fill(0);
        this.shoreSamples = [];
        // Keep nearshore mask sources across sessions — destroying them while
        // Pixi's pooled AlphaMask BindGroup still references them crashes on
        // the next ocean render (respawn). syncModelMasks reuses entries.
        this.landSeamBaker.reset();
        this.groundSynced = false;
        this.wakeIdleAt.clear();
        this.wakeMoveAt.clear();
        this.wakeSplashAt.clear();
        this.wakeLastPos.clear();
        this.wakeTravel.clear();
        this.wakeMoveDelta.clear();
        this.wakeMoveAge.clear();
        this.landFxLastPos.clear();
        this.landFxFootAt.clear();
        this.landFxTrailTravel.clear();
        this.landFxFootStep.clear();
        this.renderer.delete(DECORATION_RENDER_ID);
        this.decorations.length = 0;
        this.shadows.clear();
        this.particles.clear();
        this.clearPlacementGhost();
        this.cursorWorld = undefined;
        this.showAllHover = false;
        this.pendingObjectStates.clear();
        this.pendingLocalDrops.length = 0;
        this.user = undefined;
    }

    destroy(): void {
        this.clear();
        this.nearshoreFill.clearModelMasks();
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
            } else if (object instanceof FreecamGhost) {
                // Idle ghosts leave `updating`; still rescale on freecam zoom.
                object.tickVisual();
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

    /**
     * Session ended in death — ignore local delete / player corpse so the
     * game-over snapshot still has the avatar (and combat FX).
     */
    beginDeathCinematic(): void {
        this.deathCinematic = true;
        // Corpse may already be in-world if it loaded before the socket closed.
        this.removeLocalPlayerCorpse();
    }

    /** Drop a `player_dead` resource sitting on the local avatar (death race). */
    private removeLocalPlayerCorpse(): void {
        if (this.user === undefined) return;
        const local = this.objects.get(this.user);
        if (!local) return;
        const lx = local.container.x;
        const ly = local.container.y;
        const maxDistSq = (TILE_SIZE * 2) ** 2;
        for (const object of [...this.objects.all()]) {
            if (!(object instanceof Structure)) continue;
            if (object.placeKind !== AdminPlaceKind.Resource) continue;
            if (
                object.type !==
                modelIdForLocation("resource", "bundu:player_dead")
            ) {
                continue;
            }
            const dx = object.container.x - lx;
            const dy = object.container.y - ly;
            if (dx * dx + dy * dy > maxDistSq) continue;
            this.removeClientObject(object.id);
        }
    }

    private attachLocalPlayer(player: GameObject) {
        console.info(`Found user (id ${player.id}), loading..`);
        if (!this.camera.isFreecam()) {
            this.camera.follow(player.container);
        }
        this.refreshStructureOwnership();
        this.syncLocalAirRingParent();
    }

    /**
     * Air ring lives inside the water `fxLayer` underfoot so it shares that
     * model's DisplacementFilter and shore mask. Off water: leave the parent
     * alone (mask clips it) — don't jump to the viewport.
     */
    private syncLocalAirRingParent(): void {
        const local =
            this.user !== undefined ? this.objects.get(this.user) : undefined;
        if (!(local instanceof Player)) return;
        const ring = local.airRing;
        ring.filters = null;
        const underfoot = this.oceanVisualAtWorld(
            local.position.x,
            local.position.y
        );
        const fx = underfoot?.anchoredFxLayer;
        if (fx) {
            if (ring.parent !== fx) fx.addChildAt(ring, 0);
            else if (fx.getChildIndex(ring) !== 0) fx.setChildIndex(ring, 0);
            underfoot.setFxAnchor?.(local.position.x, local.position.y);
            return;
        }
        for (const visual of this.oceanVisuals.values()) {
            if (ring.parent !== visual.anchoredFxLayer) continue;
            visual.setFxAnchor?.(local.position.x, local.position.y);
            break;
        }
        // Once the player leaves water, keep the ring in its last water layer.
        // That layer's shore mask fades it out naturally on the way to land.
    }

    private waterModelIdAt(
        worldX: number,
        worldY: number
    ): string | undefined {
        const tx = (worldX / TILE_SIZE) | 0;
        const ty = (worldY / TILE_SIZE) | 0;
        if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) {
            return undefined;
        }
        const type = this.topGroundTypes[ty * WORLD_TILES + tx]!;
        if (type === 0 || !this.oceanTypeIds.has(type)) return undefined;
        return clientGroundType(type).model;
    }

    /** Pull the ring off a water FX before that container is destroyed. */
    private detachLocalAirRingFromOcean(visual?: GroundVisual): void {
        const local =
            this.user !== undefined ? this.objects.get(this.user) : undefined;
        if (!(local instanceof Player)) return;
        const ring = local.airRing;
        const detach = (fx: Container | undefined) => {
            if (!fx || ring.parent !== fx) return false;
            this.viewport.addChild(ring);
            return true;
        };
        if (visual) {
            detach(visual.anchoredFxLayer);
            return;
        }
        for (const v of this.oceanVisuals.values()) {
            if (detach(v.anchoredFxLayer)) return;
        }
    }

    /** FX stack for the ocean-kind model under a world pixel, if any. */
    private oceanVisualAtWorld(
        worldX: number,
        worldY: number
    ): GroundVisual | undefined {
        const modelId = this.waterModelIdAt(worldX, worldY);
        if (!modelId) return undefined;
        return this.oceanVisuals.get(
            waterFxProfileKey(oceanGroundModel(modelId))
        );
    }

    /**
     * Enter/exit freecam spectate mode: detach camera, hide the local avatar.
     * Freecam immediately drops seam LOD and keeps it cheap until exit.
     */
    setFreecamMode(enabled: boolean): void {
        this.camera.setFreecam(enabled);
        if (enabled) {
            this.applyLandSeamLod(0);
        }
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

    /** Update the local player's underwater air ring from vitals. */
    setLocalAir(air: number, max?: number): void {
        const player = this.objects.get(this.user ?? -1);
        if (!(player instanceof Player)) return;
        player.setAir(air, max);
        this.objects.updating.add(player);
    }

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
            case GameObjectData.FreecamGhostType:
                this.newFreecamGhost(packet);
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
        // Dying client still receives the corpse packet — skip it for capture.
        if (this.deathCinematic && isPlayerCorpseType(nodeType)) return;
        this.removeClientObject(packet.id);

        const structure = new Structure(
            packet.id,
            clientModelId(
                "resource",
                clientRegistries().resource.location(nodeType)
            ),
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
            clientModelId(
                "structure",
                clientRegistries().structure.location(nodeType)
            ),
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
            // Self-delete means we died — keep the avatar for the death screen.
            if (id === this.user) {
                this.deathCinematic = true;
                continue;
            }
            this.removeClientObject(id);
        }
    };

    private removeClientObject(id: number): void {
        this.pendingObjectStates.delete(id);
        this.clearLandFxState(id);
        const object = this.objects.get(id);
        if (object) {
            // Death flush can delete the local avatar while we still follow it
            // for the game-over delay — stop before the container is destroyed.
            if (this.camera.target === object.container) {
                this.camera.follow(null);
            }
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
        const existing = this.objects.get(packet.id);
        // Keep an in-flight drop animation instead of snapping to the land pose.
        if (existing instanceof GroundItem && existing.isTraveling) return;

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

    newFreecamGhost = (packet: LoadFreecamGhost) => {
        // Server never sends your own ghost (owner filtered in FreecamGhostSystem).
        const [name, playerSkin] = packet.data;
        this.removeClientObject(packet.id);
        const nameText = new Text(name, TEXT_STYLE);
        const ghost = new FreecamGhost(
            packet.id,
            nameText,
            deciPoint(packet.x, packet.y),
            getVariantName(playerSkin ?? undefined),
            () => Math.abs(this.viewport.scale.x) || 1
        );
        this.objects.add(ghost);
        this.renderer.add(ghost.id, ...ghost.containers);
    };

    /** Remember where the local player released a drop (world space + UI scale). */
    queueLocalDrop(origin: Point, startScale: number) {
        this.pendingLocalDrops.push({ origin, startScale });
    }

    dropItem = (packet: ServerPacket.DropItem) => {
        const source = this.objects.get(packet.id);
        if (!source) return;

        const target = deciPoint(packet.x, packet.y);
        const isLocal = packet.id === this.user;
        const existing = this.objects.get(packet.objectId);
        const endRotation = source.rotation;
        const item =
            existing instanceof GroundItem
                ? existing
                : new GroundItem(
                      packet.objectId,
                      packet.itemId,
                      isLocal ? target.clone() : source.position.clone(),
                      endRotation * (180 / Math.PI)
                  );
        if (!(existing instanceof GroundItem)) {
            this.objects.add(item);
            this.renderer.add(item.id, ...item.containers);
        }

        if (isLocal) {
            const pending = this.pendingLocalDrops.shift();
            item.flyFrom(
                pending?.origin ?? source.position.clone(),
                target,
                pending?.startScale ?? 0.65,
                endRotation
            );
        } else {
            item.popFrom(source.position.clone(), target);
        }
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
                    "structure",
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
        if (object.id === this.user) this.syncLocalAirRingParent();
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
                this.disposeGroundVisual(existing.visual);
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
                      h * TILE_SIZE,
                      oceanGroundModel(modelId).surfaceLayer
                          ? GROUND_Z_BASE + id
                          : GROUND_Z_OCEAN_FILL
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
                this.disposeGroundVisual(patch.visual);
                break;
            }
        }
        this.groundSynced = true;
        this.rebuildShoreSamples();
    };

    private ensureOceanVisual(type: number): GroundVisual {
        const modelId = clientGroundType(type).model;
        const model = oceanGroundModel(modelId);
        const profileKey = waterFxProfileKey(model);
        const existing = this.oceanVisuals.get(profileKey);
        if (existing) return existing;
        const zIndex = model.surfaceLayer
            ? GROUND_Z_SURFACE_WATER
            : GROUND_Z_OCEAN;
        const visual = createGround(
            type,
            0,
            0,
            WORLD_BOUNDS,
            WORLD_BOUNDS,
            zIndex
        );
        this.oceanVisuals.set(profileKey, visual);
        this.renderer.add(
            GROUND_RENDER_ID,
            visual.container,
            ...(visual.overlay ? [visual.overlay] : [])
        );
        this.syncLocalAirRingParent();
        return visual;
    }

    private disposeOceanVisual(profileKey: string, visual: GroundVisual): void {
        this.renderer.remove(GROUND_RENDER_ID, visual.container);
        if (visual.overlay) {
            this.renderer.remove(GROUND_RENDER_ID, visual.overlay);
        }
        this.disposeGroundVisual(visual);
        this.oceanVisuals.delete(profileKey);
    }

    private rebuildShoreSamples(): void {
        this.oceanTypeIds.clear();
        this.oceanTiles.fill(0);
        this.topGroundTypes.fill(0);
        const colorByType = new Map<number, number>();
        const fadeByType = new Map<number, number>();
        const modelsByFxProfile = new Map<string, Set<string>>();
        const boundsByFxProfile = new Map<string, Rectangle[]>();
        let oceanColor: number | undefined;
        const byBottom = [...this.groundPatches].sort((a, b) => a.id - b.id);
        for (const patch of byBottom) {
            const modelId = clientGroundType(patch.type).model;
            const ocean = isOceanGroundModel(modelId);
            if (ocean) {
                this.oceanTypeIds.add(patch.type);
                const model = oceanGroundModel(modelId);
                const profileKey = waterFxProfileKey(model);
                const profileModels =
                    modelsByFxProfile.get(profileKey) ?? new Set<string>();
                profileModels.add(modelId);
                modelsByFxProfile.set(profileKey, profileModels);
                const profileBounds =
                    boundsByFxProfile.get(profileKey) ?? [];
                profileBounds.push(
                    new Rectangle(
                        patch.x * TILE_SIZE,
                        patch.y * TILE_SIZE,
                        patch.w * TILE_SIZE,
                        patch.h * TILE_SIZE
                    )
                );
                boundsByFxProfile.set(profileKey, profileBounds);
                const color = parseHexColor(model.color);
                colorByType.set(patch.type, color);
                fadeByType.set(patch.type, model.fadeTiles);
                oceanColor ??= color;
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
                    this.topGroundTypes[row + tx] = patch.type;
                }
            }
        }
        if (oceanColor !== undefined) this.oceanColor = oceanColor;

        if (this.oceanTypeIds.size === 0 && this.oceanVisuals.size > 0) {
            this.detachLocalAirRingFromOcean();
            for (const [profileKey, visual] of [...this.oceanVisuals]) {
                this.disposeOceanVisual(profileKey, visual);
            }
        } else {
            for (const [profileKey, visual] of [...this.oceanVisuals]) {
                if (modelsByFxProfile.has(profileKey)) continue;
                this.detachLocalAirRingFromOcean(visual);
                this.disposeOceanVisual(profileKey, visual);
            }
        }

        const isOcean = (type: number) => this.oceanTypeIds.has(type);
        const colorOfType = (type: number) =>
            parseHexColor(groundModel(clientGroundType(type).model).color);
        const fillOfType = (type: number): SolidGroundFill | undefined => {
            const model = groundModel(clientGroundType(type).model);
            return model.kind === "solid" ? model.fill : undefined;
        };
        this.shoreSamples = collectShoreSamples(this.groundPatches, isOcean);
        this.landDistance.rebuild(this.groundPatches, isOcean, colorOfType);
        this.nearshoreFill.paint(
            this.landDistance,
            (i) => colorByType.get(this.topGroundTypes[i]!) ?? this.oceanColor,
            (i) =>
                fadeByType.get(this.topGroundTypes[i]!) ??
                DEFAULT_OCEAN_FADE_TILES,
            // Every water material participates so rivers/ponds can meet the sea.
            (i) => {
                const type = this.topGroundTypes[i]!;
                return type !== 0 && this.oceanTypeIds.has(type);
            },
            Math.max(
                DEFAULT_WATER_WATER_FADE_TILES,
                ...[...modelsByFxProfile.values()].flatMap((ids) =>
                    [...ids].map(
                        (id) => oceanGroundModel(id).transitionTiles
                    )
                )
            )
        );
        const modelMasks = this.nearshoreFill.syncModelMasks(
            new Set(modelsByFxProfile.keys()),
            (i) => {
                const type = this.topGroundTypes[i]!;
                if (type === 0 || !this.oceanTypeIds.has(type)) return undefined;
                return waterFxProfileKey(
                    oceanGroundModel(clientGroundType(type).model)
                );
            },
            // Pond FX stays on water tiles — no beach wash / land overshoot.
            new Set(
                [...modelsByFxProfile].flatMap(([profileKey, ids]) =>
                    [...ids].some(
                        (id) => !oceanGroundModel(id).shoreOvershoot
                    )
                        ? [profileKey]
                        : []
                )
            ),
            (profileKey) =>
                Math.max(
                    ...[...(modelsByFxProfile.get(profileKey) ?? [])].map(
                        (id) => oceanGroundModel(id).transitionTiles
                    )
                )
        );
        for (const [profileKey, visual] of this.oceanVisuals) {
            const mask = modelMasks.get(profileKey);
            if (mask) visual.setShoreMask?.(mask);
            visual.setWaterModelIds?.(
                modelsByFxProfile.get(profileKey) ?? new Set()
            );
            visual.setWaterBounds?.(
                boundsByFxProfile.get(profileKey) ?? []
            );
        }
        const inlandAt = (tx: number, ty: number) =>
            this.landDistance.inlandAt(tx, ty);
        for (const patch of this.groundPatches) {
            patch.visual.paintLandFill?.(inlandAt);
        }
        // Unbind before prepare destroys textures — Pixi crashes on null alphaMode
        // if sprites still reference destroyed sources.
        for (const patch of this.groundPatches) {
            patch.visual.clearLandSeam?.();
        }
        // Rebuild at crisp LOD; freecam / zoom-out may drop via live ticks.
        // Surface water (ponds) is transparent to seam occupancy so land↔land
        // borders keep baking underneath — ponds still draw above and cover them.
        this.landSeamBaker.prepare(
            this.groundPatches.filter((patch) => {
                if (!isOcean(patch.type)) return true;
                return !oceanGroundModel(clientGroundType(patch.type).model)
                    .surfaceLayer;
            }),
            isOcean,
            colorOfType,
            2,
            fillOfType,
            inlandAt
        );
        this.landSeamFrame = 0;
    }

    /** Bake a few edge-band seam chunks each frame (visible first when live). */
    private tickLandSeams(limit?: number): void {
        const live = limit === undefined;
        if (live) {
            const zoom = Math.hypot(
                this.viewport.scale.x,
                this.viewport.scale.y
            );
            this.applyLandSeamLod(
                seamLodFromZoom(zoom, this.camera.isFreecam())
            );
            this.landSeamFrame++;
            if (this.landSeamFrame % LAND_SEAM_TICK_INTERVAL !== 0) return;
            limit = LAND_SEAM_PER_TICK;
        }
        if (this.landSeamBaker.pending === 0) return;
        const view = live ? this.camera.worldBounds() : undefined;
        const baked = this.landSeamBaker.tick(limit, view);
        if (baked.length === 0) return;
        const byId = new Map(
            this.groundPatches.map((patch) => [patch.id, patch])
        );
        for (const chunk of baked) {
            byId.get(chunk.id)?.visual.applyLandSeam?.(chunk);
        }
    }

    private disposeGroundVisual(visual: GroundVisual): void {
        visual.clearLandSeam?.();
        if (visual.destroy) {
            visual.destroy();
            return;
        }
        visual.container.destroy({ children: true });
        visual.overlay?.destroy({ children: true });
    }

    /** Swap seam LOD; clears applied overlays when the baker rebuilds. */
    private applyLandSeamLod(lod: SeamLod): void {
        if (!this.landSeamBaker.setLod(lod)) return;
        for (const patch of this.groundPatches) {
            patch.visual.clearLandSeam?.();
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
        this.spawnLandMoveFx(now);

        const bounds = this.viewport.getVisibleBounds();
        const view = {
            minX: bounds.x,
            minY: bounds.y,
            maxX: bounds.x + bounds.width,
            maxY: bounds.y + bounds.height,
        };
        const dayPeriod = this.sky.currentCycle;
        const solidModelAt = (worldX: number, worldY: number) => {
            const tx = (worldX / TILE_SIZE) | 0;
            const ty = (worldY / TILE_SIZE) | 0;
            if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) {
                return undefined;
            }
            const type = this.topGroundTypes[ty * WORLD_TILES + tx]!;
            if (type === 0 || this.oceanTypeIds.has(type)) return undefined;
            return clientGroundType(type).model;
        };
        this.ambientParticles.update({
            now,
            dayPeriod,
            view,
            solidModelAt,
            decorations: this.decorations,
            objects: this.objects.all(),
            emitParticles: (burst) => this.particles.burst(burst),
        });

        if (this.oceanTypeIds.size === 0) return;

        const oceanTiles = this.oceanTiles;
        const isOceanAt = (worldX: number, worldY: number) => {
            const tx = (worldX / TILE_SIZE) | 0;
            const ty = (worldY / TILE_SIZE) | 0;
            if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) {
                return false;
            }
            return oceanTiles[ty * WORLD_TILES + tx] === 1;
        };
        const oceanVisualAt = (worldX: number, worldY: number) =>
            this.oceanVisualAtWorld(worldX, worldY);

        this.spawnWakeRipples(deltaMS, now, isOceanAt, oceanVisualAt);

        const waterModelAt = (worldX: number, worldY: number) => {
            const tx = (worldX / TILE_SIZE) | 0;
            const ty = (worldY / TILE_SIZE) | 0;
            if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) {
                return undefined;
            }
            const type = this.topGroundTypes[ty * WORLD_TILES + tx]!;
            if (type === 0 || !this.oceanTypeIds.has(type)) return undefined;
            return clientGroundType(type).model;
        };
        const ctx = {
            deltaMS,
            now,
            dayPeriod,
            view,
            renderer: this.pixi,
            emitParticles: (burst: ParticleBurst) => this.particles.burst(burst),
            shore: this.shoreSamples,
            isOceanAt,
            waterModelAt,
            landDistanceAt: (wx: number, wy: number) =>
                this.landDistance.atWorld(wx, wy),
            shoreColor: this.nearshoreFill.colorTexture,
            shoreMask: this.nearshoreFill.maskTexture,
        };
        for (const visual of this.oceanVisuals.values()) visual.update?.(ctx);
        for (const patch of this.groundPatches) patch.visual.update?.(ctx);
        this.syncLocalAirRingParent();
    }

    /**
     * Footsteps / debris trails for movers on solid ground.
     * Land toggles footsteps; actor models define the print params/texture.
     */
    private spawnLandMoveFx(now: number): void {
        const types = this.topGroundTypes;
        const circle = softCircleTexture();

        for (const object of this.objects.all()) {
            if (!(object instanceof Player || object instanceof Animal)) {
                continue;
            }

            const { x, y } = object.position;
            const tx = (x / TILE_SIZE) | 0;
            const ty = (y / TILE_SIZE) | 0;
            if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) {
                this.clearLandFxState(object.id);
                continue;
            }

            const typeId = types[ty * WORLD_TILES + tx] ?? 0;
            if (typeId === 0 || this.oceanTypeIds.has(typeId)) {
                this.clearLandFxState(object.id);
                continue;
            }

            const ground = solidGroundModel(clientGroundType(typeId).model);
            const actorSteps = actorFootsteps(object);
            if (!ground?.trail && !(ground?.footsteps && actorSteps)) {
                this.clearLandFxState(object.id);
                continue;
            }

            const prev = this.landFxLastPos.get(object.id);
            this.landFxLastPos.set(object.id, { x, y });
            if (!prev) continue;

            const stepX = x - prev.x;
            const stepY = y - prev.y;
            const step = Math.hypot(stepX, stepY);
            // Ignore teleport/resync jumps so recycled ids don't spray FX.
            if (step < 0.5 || step > TILE_SIZE * 4) {
                if (step > TILE_SIZE * 4) {
                    this.landFxLastPos.set(object.id, { x, y });
                    this.landFxTrailTravel.set(object.id, 0);
                }
                continue;
            }

            const direction = Math.atan2(stepY, stepX);
            const landColor = parseHexColor(ground.color);

            if (ground.footsteps && actorSteps) {
                const interval = actorSteps.intervalMs || 250;
                const last = this.landFxFootAt.get(object.id);
                if (last === undefined || now - last >= interval) {
                    this.landFxFootAt.set(object.id, now);
                    const stepIndex =
                        (this.landFxFootStep.get(object.id) ?? 0) + 1;
                    this.landFxFootStep.set(object.id, stepIndex);
                    const side = stepIndex % 2 === 0 ? 1 : -1;
                    const perp = direction + Math.PI / 2;
                    const stride = actorSteps.stride * side;
                    const behind = object.collisionRadius * 0.65;
                    const { texture, tint } = footstepTexture(
                        actorSteps,
                        circle
                    );
                    this.particles.burst(
                        landFootstep(
                            texture,
                            x -
                                Math.cos(direction) * behind +
                                Math.cos(perp) * stride,
                            y -
                                Math.sin(direction) * behind +
                                Math.sin(perp) * stride,
                            actorSteps,
                            tint
                        )
                    );
                }
            }

            if (ground.trail) {
                const travel =
                    (this.landFxTrailTravel.get(object.id) ?? 0) + step;
                if (travel >= ground.trail.spacing) {
                    this.landFxTrailTravel.set(object.id, 0);
                    const diameter = object.collisionRadius * 2;
                    for (const burst of landTrailBursts(
                        circle,
                        x,
                        y,
                        direction + Math.PI,
                        landColor,
                        diameter,
                        ground.trail
                    )) {
                        this.particles.burst(burst);
                    }
                } else {
                    this.landFxTrailTravel.set(object.id, travel);
                }
            }
        }
    }

    private clearLandFxState(id: number): void {
        this.landFxLastPos.delete(id);
        this.landFxFootAt.delete(id);
        this.landFxTrailTravel.delete(id);
        this.landFxFootStep.delete(id);
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
        const object = this.objects.get(id);
        if (object instanceof FreecamGhost) {
            object.showChatMessage(message);
            return;
        }
        if (!(object instanceof Player)) return;
        // Freecam owner gets a body-id echo for the HUD log only.
        if (id === this.user && this.camera.isFreecam()) return;
        object.showChatMessage(message);
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
