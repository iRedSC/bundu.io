import { Graphics, type Container, type Point as PixiPoint } from "pixi.js";
import { radians } from "@bundu/shared";
import { AdminPlaceKind } from "@bundu/shared/packet_definitions";
import { TILE_SIZE } from "@bundu/shared/tiles";
import type {
    EntityStateSnapshot,
    EntityStateValue,
} from "@bundu/shared/object_types";
import GameObject from "../game_object";
import {
    SpriteFactory,
    type ContaineredSprite,
} from "@client/assets/sprite_factory";
import { clientStructurePlacement } from "../../configs/registries";
import { assemble, assembleTileEntity } from "../../models/assemble";
import { bindAnimations } from "../../models/bind";
import {
    EntityStateStore,
    ModelStateController,
} from "../../models/state";
import {
    lookupModel,
    lookupObjectDef,
    structureDef,
    tileEntityDefs,
} from "../../models/defs";
import type {
    AnimContext,
    ObjectDef,
    PartNode,
} from "../../models/types";
import { EMPTY_ANIM_CONTEXT } from "../../models/types";
import type { AnimationManager } from "../../animation/runtime";
import type { ParticleBurst } from "../../rendering/particles/types";
import { ANIMATION } from "../../animation/animations";
import { hitRotation } from "../../models/animations/hit";

const HEALTH_BAR_WIDTH = 48;
const HEALTH_BAR_HEIGHT = 5;
const HEALTH_BAR_Y = -52;
const HEALTH_BAR_FADE_MS = 150;
const HEALTH_BAR_DISPLAY_MS = 2_500;
const HEALTH_BAR_ENEMY = 0xd94b4b;
/** Matches local HUD health tint. */
const HEALTH_BAR_FRIENDLY = 0x88fa57;
/** Person mark under friendly bars (colorblind ownership cue). */
const FRIENDLY_PERSON_TOP = HEALTH_BAR_Y + HEALTH_BAR_HEIGHT + 4;
const FRIENDLY_PERSON_HEAD_R = 2.75;
const FRIENDLY_PERSON_BODY_W = 8;
const FRIENDLY_PERSON_BODY_H = 6.5;
const FRIENDLY_PERSON_GAP = 1;
/** World zIndex when a top-level part omits `zIndex`. */
const DEFAULT_STRUCTURE_Z = 10;

function ownerIdFromStates(states: EntityStateSnapshot): number {
    const value = states.ownerId;
    return typeof value === "number" ? value : -1;
}

/** Placed tile entity. Art is authored at TILE_SIZE px per footprint tile. */
export class Structure extends GameObject {
    private _sprite?: ContaineredSprite;
    readonly type: string;
    /** Gameplay registry id (`structure` / `resource`); `-1` when unset. */
    readonly typeId: number;
    /** Resource vs structure — used by freecam delete hover filtering. */
    placeKind:
        | typeof AdminPlaceKind.Resource
        | typeof AdminPlaceKind.Structure = AdminPlaceKind.Structure;
    private readonly animationManager: AnimationManager;
    private readonly states: EntityStateStore;
    private readonly animContext: AnimContext = { ...EMPTY_ANIM_CONTEXT };
    private stateController?: ModelStateController;
    private usesWorldDisplay = false;
    /** When set, context scale multiplies this instead of replacing it. */
    private authoredSpriteScale?: number;
    private readonly variant?: string;
    private readonly healthBar = new Graphics();
    private healthBarAlpha = 0;
    private healthBarFadeFrom = 0;
    private healthBarFadeTo = 0;
    private healthBarFadeStartedAt = 0;
    private healthBarShownUntil = 0;
    private hovered = false;
    private hasHealth = false;
    private health = 0;
    private maxHealth = 0;
    /** `-1` = unowned. Compared to `localPlayerId` for friendly tint. */
    private ownerId = -1;
    private localPlayerId?: number;
    /** Top-level part roots promoted for world zIndex sorting via LayeredRenderer. */
    private worldLayers: Container[] = [];
    /** Authored sky-hole radius scales (0.5 × spriteScale × structure scale). */
    private skyHoleRadiusScales: number[] = [];
    /** World-space overlays synced like healthBar (placement invalid mark). */
    private syncedOverlays: Container[] = [];
    private visuals: ContaineredSprite[] = [];
    private parts = new Map<string, PartNode>();

    constructor(
        id: number,
        type: string,
        pos: PixiPoint,
        rotationDegrees: number,
        collisionRadius: number,
        animationManager: AnimationManager,
        visualScale: number = TILE_SIZE,
        variant?: string,
        health?: number,
        maxHealth?: number,
        states: EntityStateSnapshot = {},
        typeId = -1
    ) {
        super(id, pos, radians(rotationDegrees), collisionRadius, visualScale);

        this.type = type;
        this.typeId = typeId;
        this.variant = variant;
        this.animationManager = animationManager;
        this.states = new EntityStateStore(states);
        this.ownerId = ownerIdFromStates(states);
        this.applyModelDefinition(variant);
        this.container.zIndex = DEFAULT_STRUCTURE_Z;
        this.healthBar.zIndex = 100;
        this.healthBar.position.copyFrom(pos);
        this.setHealth(health ?? 0, maxHealth ?? 0);
    }

    override get containers(): Container[] {
        return [
            this.container,
            ...this.worldLayers,
            ...this.syncedOverlays,
            this.healthBar,
        ];
    }

    get sprite(): ContaineredSprite {
        if (!this._sprite) throw new Error("Structure sprite is unavailable");
        return this._sprite;
    }

    set sprite(value: ContaineredSprite) {
        this._sprite = value;
    }

    /** Part visuals used for texture-following interaction highlights. */
    partNodes(): ReadonlyMap<string, PartNode> {
        return this.parts;
    }

    get ownerIdValue(): number {
        return this.ownerId;
    }

    getState(name: string): EntityStateValue | undefined {
        return this.states.get(name);
    }

    /** Intact doors (and future interactables) under the cursor. */
    get isInteractable(): boolean {
        if (this.placeKind !== AdminPlaceKind.Structure) return false;
        if (this.typeId < 0) return false;
        if (this.states.get("rotting") === true) return false;
        try {
            return clientStructurePlacement(this.typeId).class === "door";
        } catch {
            return false;
        }
    }

    override update(_now?: number): boolean {
        const done = super.update();
        this.syncWorldLayers();
        return done;
    }

    /** Copy object transform onto promoted layers (also used by placement ghost). */
    syncWorldLayers(): void {
        const { x, y } = this.container.position;
        const rotation = this.container.rotation;
        const scaleX = this.container.scale.x;
        const scaleY = this.container.scale.y;
        for (const layer of this.worldLayers) {
            layer.position.set(x, y);
            layer.rotation = rotation;
            layer.scale.set(scaleX, scaleY);
        }
        for (const overlay of this.syncedOverlays) {
            overlay.position.set(x, y);
            overlay.rotation = rotation;
        }
        this.healthBar.position.set(x, y);
    }

    /** Wire particle bursts for ambient presets (rotting crumble). */
    enableParticles(emit: (burst: ParticleBurst) => void): void {
        this.animContext.emitParticles = emit;
        this.animContext.particleAnchor = () => ({
            texture: this.sprite.sprite.texture,
            x: this.position.x,
            y: this.position.y,
            radius: this.collisionRadius,
        });
    }

    /** Play hit wiggle scaled by strength (kick + knockback already clamped). */
    playHit(angle: number, kickDegrees: number, knockback: number): void {
        const animation = hitRotation(this, {
            angle,
            kickDegrees,
            knockback,
            onApply: () => this.syncWorldLayers(),
        });
        this.animationManager.set(this, ANIMATION.HIT, animation.run(), true);
    }

    /** Attach a world-space overlay that follows this structure (placement X). */
    addSyncedOverlay(overlay: Container): void {
        this.syncedOverlays.push(overlay);
        this.syncWorldLayers();
    }

    /** Ghost tint/alpha across all promoted visual layers. */
    setGhostAppearance(alpha: number, tint: number): void {
        for (const visual of this.visuals) {
            visual.alpha = alpha;
            visual.sprite.tint = tint;
        }
    }

    /** Soft discs this structure punches from the sky multiply overlay. */
    skyHoles(): { x: number; y: number; radius: number }[] {
        const scale = Math.abs(this.container.scale.x);
        return this.skyHoleRadiusScales.map((radiusScale) => ({
            x: this.position.x,
            y: this.position.y,
            radius: 0.5 * radiusScale * scale,
        }));
    }

    setHealth(health: number, maxHealth: number, time?: number) {
        this.health = health;
        this.maxHealth = maxHealth;
        this.hasHealth = maxHealth > 0;
        this.drawHealthBar();
        if (time === undefined || !this.hasHealth) {
            this.healthBar.visible = false;
            return;
        }

        this.healthBarShownUntil = Math.max(
            this.healthBarShownUntil,
            time + HEALTH_BAR_DISPLAY_MS
        );
        this.showHealthBar(time);
    }

    /** Recompute friendly tint when the local player id becomes known or changes. */
    setLocalPlayerId(localPlayerId: number | undefined) {
        if (this.localPlayerId === localPlayerId) return;
        this.localPlayerId = localPlayerId;
        this.drawHealthBar();
    }

    private get friendly(): boolean {
        return (
            this.localPlayerId !== undefined &&
            this.ownerId === this.localPlayerId
        );
    }

    private drawHealthBar() {
        const ratio =
            this.maxHealth > 0
                ? Math.max(0, Math.min(1, this.health / this.maxHealth))
                : 0;
        const x = -HEALTH_BAR_WIDTH / 2;
        const fill = this.friendly ? HEALTH_BAR_FRIENDLY : HEALTH_BAR_ENEMY;

        this.healthBar.clear();
        this.healthBar
            .rect(x, HEALTH_BAR_Y, HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT)
            .fill(0x1a1a1a);
        if (ratio > 0) {
            this.healthBar
                .rect(x, HEALTH_BAR_Y, HEALTH_BAR_WIDTH * ratio, HEALTH_BAR_HEIGHT)
                .fill(fill);
        }
        if (this.friendly && this.hasHealth) {
            const headY = FRIENDLY_PERSON_TOP + FRIENDLY_PERSON_HEAD_R;
            const bodyY =
                FRIENDLY_PERSON_TOP +
                FRIENDLY_PERSON_HEAD_R * 2 +
                FRIENDLY_PERSON_GAP;
            this.healthBar
                .circle(0, headY, FRIENDLY_PERSON_HEAD_R)
                .fill(HEALTH_BAR_FRIENDLY);
            // Shoulders-wide torso that tapers slightly (simple “person” glyph).
            this.healthBar
                .poly([
                    -FRIENDLY_PERSON_BODY_W / 2,
                    bodyY,
                    FRIENDLY_PERSON_BODY_W / 2,
                    bodyY,
                    FRIENDLY_PERSON_BODY_W / 2 - 1.5,
                    bodyY + FRIENDLY_PERSON_BODY_H,
                    -FRIENDLY_PERSON_BODY_W / 2 + 1.5,
                    bodyY + FRIENDLY_PERSON_BODY_H,
                ])
                .fill(HEALTH_BAR_FRIENDLY);
        }
    }

    updateHealthBar(
        time: number,
        cursor?: { x: number; y: number },
        forceShow = false
    ) {
        if (!this.hasHealth) {
            this.healthBar.visible = false;
            return;
        }

        const hovered =
            forceShow ||
            (cursor !== undefined &&
                Math.hypot(
                    cursor.x - this.position.x,
                    cursor.y - this.position.y
                ) <= Math.max(this.collisionRadius, TILE_SIZE / 2));
        if (hovered && !this.hovered) this.showHealthBar(time);
        if (!hovered && this.hovered && time >= this.healthBarShownUntil) {
            // Hover-only: drop immediately. Hit hold still active: keep showing.
            this.hideHealthBar(time);
        }
        this.hovered = hovered;

        if (!hovered && time >= this.healthBarShownUntil) {
            this.hideHealthBar(time);
        }
        this.updateHealthBarFade(time);
        this.healthBar.alpha = this.healthBarAlpha;
        this.healthBar.visible = this.healthBarAlpha > 0;
    }

    private showHealthBar(time: number) {
        this.updateHealthBarFade(time);
        if (this.healthBarFadeTo === 1) return;
        this.healthBarFadeFrom = this.healthBarAlpha;
        this.healthBarFadeTo = 1;
        this.healthBarFadeStartedAt = time;
    }

    private hideHealthBar(time: number) {
        this.updateHealthBarFade(time);
        if (this.healthBarFadeTo === 0) return;
        this.healthBarFadeFrom = this.healthBarAlpha;
        this.healthBarFadeTo = 0;
        this.healthBarFadeStartedAt = time;
    }

    private updateHealthBarFade(time: number) {
        const progress = Math.min(
            1,
            (time - this.healthBarFadeStartedAt) / HEALTH_BAR_FADE_MS
        );
        this.healthBarAlpha =
            this.healthBarFadeFrom +
            (this.healthBarFadeTo - this.healthBarFadeFrom) * progress;
    }

    private applyModelDefinition(variant?: string) {
        const tileEntity = tileEntityDefs.get(this.type);
        const objectVisual = lookupObjectDef(this.type);
        const def: ObjectDef = tileEntity ?? objectVisual ?? {
            ...structureDef,
            id: this.type,
        };

        const { parts } = tileEntity
            ? assembleTileEntity(tileEntity, this.container, variant)
            : assemble(def, this.container, variant);
        const first = parts.values().next().value;
        if (!first) {
            throw new Error(`Structure definition "${def.id}" has no parts`);
        }

        this.promoteWorldLayers(def, parts);
        this.parts = parts;
        this.visuals = [...parts.values()].map((part) => part.visual);
        this.sprite = first.visual;
        this.usesWorldDisplay = tileEntity === undefined;
        // Authored scale from the part that became `this.sprite` (first assembled part).
        if (objectVisual) {
            const spritePart = def.parts.find(
                (p) => parts.get(p.name)?.visual === this.sprite
            );
            this.authoredSpriteScale = spritePart?.spriteScale ?? 1;
        } else {
            this.authoredSpriteScale = undefined;
        }
        this.refreshModelDisplay();

        const { animations, autoplay } = bindAnimations(
            def,
            parts,
            this.animContext,
            this
        );
        for (const [animId, animation] of animations) {
            this.animations.set(animId, animation);
        }
        for (const animId of autoplay) {
            this.trigger(animId, this.animationManager);
        }
        this.stateController = new ModelStateController(
            def,
            parts,
            animations,
            this.states,
            this.animationManager,
            this
        );
    }

    /**
     * Lift top-level parts out of the object root so their authored `zIndex`
     * participates in viewport sorting via LayeredRenderer.
     */
    private promoteWorldLayers(
        def: ObjectDef,
        parts: Map<string, PartNode>
    ): void {
        this.worldLayers = [];
        this.skyHoleRadiusScales = [];
        for (const part of def.parts) {
            if (part.parent) continue;
            const node = parts.get(part.name);
            if (!node) continue;
            node.root.removeFromParent();
            if (part.skyUndo) {
                // Radius only — soft discs are baked into the sky mask.
                this.skyHoleRadiusScales.push(part.spriteScale ?? 1);
                node.root.destroy({ children: true });
                parts.delete(part.name);
                continue;
            }
            node.root.zIndex = part.zIndex ?? DEFAULT_STRUCTURE_Z;
            this.worldLayers.push(node.root);
        }
        this.syncWorldLayers();
    }

    refreshModelDisplay() {
        if (!this.usesWorldDisplay) return;
        const display = lookupModel(this.type)?.displays.world;
        if (!display?.texture) return;
        if (this.authoredSpriteScale !== undefined) {
            // Unit-normalize texture; display scale multiplies ObjectDef spriteScale
            // (does not replace container / physics visualScale).
            SpriteFactory.update(
                this.sprite,
                {
                    x: display.x,
                    y: display.y,
                    rotation: display.rotation,
                    scale: 1,
                },
                display.texture
            );
            this.sprite.scale.set(
                this.authoredSpriteScale * (display.scale ?? 1)
            );
        } else {
            SpriteFactory.update(this.sprite, display, display.texture);
        }
        this.sprite.renderable = true;
    }

    /** Server roof connectivity group; used to fade whole roofs together. */
    get roofGroupId(): number | undefined {
        const value = this.states.get("roofGroupId");
        return typeof value === "number" ? value : undefined;
    }

    setState(name: string, value: EntityStateValue) {
        this.states.set(name, value);
        if (name === "ownerId" && typeof value === "number") {
            this.ownerId = value;
            this.drawHealthBar();
        }
    }

    applyStates(states: EntityStateSnapshot) {
        for (const [name, value] of Object.entries(states)) {
            this.states.set(name, value);
        }
        if ("ownerId" in states) {
            this.ownerId = ownerIdFromStates(states);
            this.drawHealthBar();
        }
    }

    tickVisual(time: number) {
        // Keep promoted layers in sync when anims mutate container (e.g. hit wiggle)
        // without the object being in the position/rotation updating set.
        this.syncWorldLayers();
        this.stateController?.tick(time);
    }

    /**
     * Rebuild visuals. Caller must `renderer.replace(id, ...containers)` so
     * newly promoted layers are tracked (hot reload).
     */
    reloadModelDefinition() {
        this.stateController?.dispose();
        this.stateController = undefined;
        this.animationManager.remove(this);
        // Abandon old world layers; LayeredRenderer.replace destroys orphans.
        this.worldLayers = [];
        this.skyHoleRadiusScales = [];
        this.visuals = [];
        this.parts = new Map();
        for (const child of this.container.removeChildren()) {
            child.destroy({ children: true });
        }
        this.animations.clear();
        this.applyModelDefinition(this.variant);
    }

    override dispose(): void {
        this.stateController?.dispose();
        this.stateController = undefined;
        this.animationManager.remove(this);
        super.dispose();
    }
}
