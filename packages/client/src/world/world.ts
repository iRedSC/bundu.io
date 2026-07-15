import {
    FOOTPRINT_CIRCLE_RADIUS,
    TILE_SIZE,
    deciToWorld,
} from "@bundu/shared/tiles";
import type { ServerPacket } from "@bundu/shared/packet_definitions";
import { Player } from "./objects/player";
import { Sky } from "./sky";
import { createGround } from "./ground";
import {
    radians,
    structureOriginAtPoint,
    structurePlacementDef,
    tileCenterWorld,
} from "@bundu/shared";
import { AnimationManagers } from "../animation/animations";
import { TEXT_STYLE } from "../assets/text";
import { Point, Text } from "pixi.js";
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
import { getStringId } from "@bundu/shared/id_map";
import { getVariantName } from "@bundu/shared/variant_map";
import {
    SpriteFactory,
    type ContaineredSprite,
} from "../assets/sprite_factory";
import { ParticleSystem } from "@client/rendering/particles/particle_system";
import { updateOcclusion } from "./occlusion";
import { Animal } from "./objects/animal";
import { clientTime } from "@client/globals";

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
const PLACEMENT_GHOST_TINT = 0xff5555;
const PLACEMENT_GHOST_NORMAL_TINT = 0xffffff;

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
    sky: Sky;
    particles: ParticleSystem;
    private placementGhost?: Structure;
    private placementInvalidOverlay?: ContaineredSprite;
    private placementGhostType = 0;
    private placementGhostAllowed?: boolean;
    private cursorWorld?: { x: number; y: number };
    private readonly pendingObjectStates = new Map<number, EntityStateSnapshot>();

    constructor(viewport: Viewport) {
        this.viewport = viewport;
        this.camera = new Camera(viewport);
        this.sky = new Sky();
        this.renderer = new LayeredRenderer(this.viewport);
        this.particles = new ParticleSystem(this.viewport);
        this.objects = new ObjectContainer();
        this.combatFx = new CombatFx(this.objects, this.particles);

        this.viewport.addChild(this.sky);
        this.viewport.sortChildren();
    }

    clear() {
        this.camera.follow(null);

        const ids = Array.from(this.objects.all(), (object) => object.id);
        for (const id of ids) this.removeClientObject(id);
        this.renderer.delete(-10);
        this.particles.clear();
        this.clearPlacementGhost();
        this.cursorWorld = undefined;
        this.pendingObjectStates.clear();
        this.user = undefined;
    }

    destroy(): void {
        this.clear();
        this.particles.destroy();
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
        const localPlayer =
            this.user !== undefined ? this.objects.get(this.user) : undefined;
        updateOcclusion(localPlayer, this.objects.all());
        for (const object of this.objects.all()) {
            if (object instanceof Structure) {
                object.updateHealthBar(now, this.cursorWorld);
            }
        }
        this.particles.update(deltaMS);
        this.updatePlacementGhost();
        this.camera.update();
    }

    setCursorWorld(position: { x: number; y: number }) {
        this.cursorWorld = position;
    }

    private attachLocalPlayer(player: GameObject) {
        console.info(`Found user (id ${player.id}), loading..`);
        this.camera.follow(player.container);
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
            getStringId(nodeType),
            deciPoint(packet.x, packet.y),
            packet.rotation,
            typeof collisionRadius === "number"
                ? collisionRadius
                : FOOTPRINT_CIRCLE_RADIUS,
            AnimationManagers.World,
            typeof scale === "number" ? TILE_SIZE * scale : TILE_SIZE,
            getVariantName(variantId)
        );
        structure.enableParticles((burst) => this.particles.burst(burst));
        this.objects.add(structure);
        this.renderer.add(structure.id, ...structure.containers);
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
            getStringId(nodeType),
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
        structure.enableParticles((burst) => this.particles.burst(burst));
        this.objects.add(structure);
        this.renderer.add(structure.id, ...structure.containers);
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
        if (!this.placementGhost) return;
        if (this.placementGhostAllowed !== packet.allowed) {
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
    };

    refreshPlacementGhost() {
        this.placementGhostType = 0;
        this.updatePlacementGhost();
    }

    private updatePlacementGhost() {
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
                getStringId(placement.id),
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
                "invalid_placement"
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

        const def = structurePlacementDef(placement.id);
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
        for (const [type, x, y, w, h] of packet.groundData) {
            this.renderer.add(
                -10,
                createGround(
                    type,
                    x * TILE_SIZE,
                    y * TILE_SIZE,
                    w * TILE_SIZE,
                    h * TILE_SIZE
                )
            );
        }
    };

    chatMessage = ({ id, message }: ServerPacket.ChatMessage) => {
        const player = this.objects.get(id);
        if (!(player instanceof Player)) return;
        player.showChatMessage(message);
    };

    craftEvent = (
        { id, duration, itemId }: ServerPacket.CraftEvent,
        serverTimestamp: number
    ) => {
        const player = this.objects.get(id);
        if (!(player instanceof Player)) return;
        player.setCraftProgress(
            duration,
            itemId,
            clientTime.fromServer(serverTimestamp)
        );
        if (duration > 0) this.objects.updating.add(player);
    };
}
