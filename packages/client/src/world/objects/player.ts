import {
    TILE_SIZE,
    worldToTile,
    type TilePos,
    type TileRot,
} from "@bundu/shared";
import {
    clientRegistries,
    clientModelId,
} from "../../configs/registries";
import { type Container, Graphics, type Point, Text } from "pixi.js";
import GameObject from "../game_object";
import type { AnimationManager } from "../../animation/runtime";
import { SpriteFactory } from "../../assets/sprite_factory";
import { assemble, spilloverSpriteScale } from "../../models/assemble";
import { bindAnimations } from "../../models/bind";
import { playerDef } from "../../models/defs";
import type { AnimContext, PartNode, SlotDef } from "../../models/types";
import { mountModel, type MountedModel } from "../../models/mount";
import { clientTime } from "@client/globals";
import type { ParticleBurst } from "../../rendering/particles/types";
import { GROUND_Z_OCEAN } from "../ground/create";
import { colorLerp, lerp } from "@bundu/shared/transforms";

const BODY_TEXTURE = "bundu/entity/player/player.png";
const BODY_WITHOUT_FEATURES =
    "bundu/entity/player/player_without_features.png";

type nullish = undefined | null;

export interface Equipment {
    mainhand: number | nullish;
    offhand: number | nullish;
    helmet: number | nullish;
    backpack: boolean | nullish;
}

const CRAFT_BAR_WIDTH = 48;
const CRAFT_BAR_HEIGHT = 5;
const CRAFT_BAR_Y = -52;
const CRAFT_BAR_BG = 0x1a1a1a;
const CRAFT_BAR_FILL = 0xe8c547;
const CHAT_MESSAGE_Y = -88;
const CHAT_MESSAGE_DURATION = 5_000;

/** Just under ocean FX so water draws over the gauge. */
const AIR_RING_Z = GROUND_Z_OCEAN - 1;
const AIR_RING_RADIUS_SCALE = 1.9;
const AIR_RING_WIDTH = 28;
const AIR_RING_COLOR = 0xa8e6ff;
const AIR_RING_EMPTY_TRACK = 0xe74c3c;
const AIR_RING_LOW_RATIO = 0.25;
const AIR_RING_TRACK_ALPHA = 0.12;
const AIR_RING_EMPTY_TRACK_ALPHA = 0.45;
const AIR_RING_FILL_ALPHA = 0.4;
const AIR_RING_SHAKE_HZ = 4;
const AIR_RING_SHAKE_RAD = 0.08;
const AIR_RING_VALUE_LERP = 0.12;
const AIR_RING_FADE_LERP = 0.1;
/**
 * Parent FX DisplacementFilter shifts the ring ~half a radius down+right;
 * counter-offset so it still reads centered on the player.
 */
const AIR_RING_DISPLACE_NUDGE = 0.62;
const AIR_DEFAULT_MAX = 100;

export class Player extends GameObject implements AnimContext {
    name: Text;
    chatMessage: Text;
    craftBar: Graphics;
    /** World-space air gauge; sits under ocean FX. */
    airRing: Graphics;
    parts: Map<string, PartNode>;
    private slots: Map<string, { node: PartNode; def: SlotDef }>;
    private readonly slotModels = new Map<string, MountedModel>();
    private readonly animationManager: AnimationManager;
    private readonly visualVariant?: string;

    mainhand = "";
    offhand = "";
    helmet = "";
    backpack?: boolean;
    blocking = false;
    eating = false;
    eatingDuration?: number;
    emitParticles?: AnimContext["emitParticles"];
    particleAnchor?: AnimContext["particleAnchor"];

    private craftDuration = 0;
    private craftEndsAt = 0;
    craftingRecipeId: number | null = null;
    private chatTimeout?: ReturnType<typeof setTimeout>;
    private selectedStructureId = 0;
    private structureRotation: TileRot = 0;
    private structureCursor: TilePos = { x: 0, y: 0 };
    private air = AIR_DEFAULT_MAX;
    private airMax = AIR_DEFAULT_MAX;
    private airDisplay = AIR_DEFAULT_MAX;
    /** 0 = hidden, 1 = fully shown. */
    private airFade = 0;
    private readonly airShakePhase = Math.random() * Math.PI * 2;

    /** Client-side look prediction; snaps immediately (no lerp flicker). */
    predictLook(rotation: number): number {
        this.rotationStates.snap(rotation);
        this.container.rotation = rotation;
        return rotation;
    }

    get isCrafting(): boolean {
        return this.craftDuration > 0;
    }

    constructor(
        id: number,
        manager: AnimationManager,
        name: Text,
        pos: Point,
        rotation: number,
        collisionRadius: number,
        scale = 1,
        variant?: string
    ) {
        super(id, pos, rotation, collisionRadius, TILE_SIZE * (scale ?? 1));

        this.animationManager = manager;
        this.visualVariant = variant;
        this.parts = new Map();
        this.slots = new Map();

        const assembled = assemble(playerDef, this.container, variant);
        this.parts = assembled.parts;
        this.slots = assembled.slots;

        const { animations, autoplay } = bindAnimations(
            playerDef,
            this.parts,
            this
        );
        for (const [animId, animation] of animations) {
            this.animations.set(animId, animation);
        }
        for (const animId of autoplay) {
            this.trigger(animId, manager);
        }

        this.name = name;
        this.name.scale.set(0.6);
        this.name.roundPixels = true;
        this.name.anchor.set(0.5, 3);
        this.name.zIndex = 100;
        this.container.zIndex = 1;

        this.chatMessage = new Text({ text: "", style: name.style });
        this.chatMessage.scale.set(0.5);
        this.chatMessage.roundPixels = true;
        this.chatMessage.anchor.set(0.5, 1);
        this.chatMessage.position.set(pos.x, pos.y + CHAT_MESSAGE_Y);
        this.chatMessage.zIndex = 102;
        this.chatMessage.visible = false;

        this.craftBar = new Graphics();
        this.craftBar.zIndex = 101;
        this.craftBar.visible = false;

        this.airRing = new Graphics();
        this.airRing.zIndex = AIR_RING_Z;
        this.airRing.visible = false;

        this.positionStates.callback = () => {
            this.name.renderable = true;
            this.chatMessage.renderable = true;
            this.craftBar.renderable = true;
            this.airRing.renderable = true;
            this.container.renderable = true;
            this.debug.renderable = true;
        };
    }

    override get containers(): Container[] {
        return [
            this.airRing,
            this.container,
            this.name,
            this.craftBar,
            this.chatMessage,
        ];
    }

    override update(now?: number): boolean {
        const done = super.update(now);
        this.name.position = this.position;
        this.chatMessage.position.set(
            this.position.x,
            this.position.y + CHAT_MESSAGE_Y
        );
        this.craftBar.position = this.position;
        const airR = this.collisionRadius * AIR_RING_RADIUS_SCALE;
        const nudge = airR * AIR_RING_DISPLACE_NUDGE;
        this.airRing.position.set(
            this.position.x - nudge,
            this.position.y - nudge
        );
        this.redrawCraftBar(now);
        const airAnimating = this.tickAirRing();
        // Stay in the updating set while the bar / air ring is animating.
        return done && !this.isCrafting && !airAnimating;
    }

    /** Drive the underwater air ring from vitals (`air` / `airMax`). */
    setAir(value: number, max = this.airMax): void {
        this.airMax = Math.max(1, max);
        this.air = Math.min(this.airMax, Math.max(0, value));
    }

    /** `duration > 0` starts the overhead channel; `0` clears it. */
    setCraftProgress(duration: number, recipeId: number, startedAt: number) {
        if (duration <= 0) {
            this.craftDuration = 0;
            this.craftEndsAt = 0;
            this.craftingRecipeId = null;
            this.craftBar.clear();
            this.craftBar.visible = false;
            return;
        }
        this.craftDuration = duration;
        this.craftEndsAt = startedAt + duration;
        this.craftingRecipeId = recipeId;
        this.craftBar.visible = true;
        this.redrawCraftBar(startedAt);
    }

    private redrawCraftBar(now = clientTime.now()) {
        if (this.craftDuration <= 0) return;

        const remaining = Math.max(0, this.craftEndsAt - now);
        const progress = 1 - remaining / this.craftDuration;
        const fillWidth = CRAFT_BAR_WIDTH * Math.min(1, Math.max(0, progress));
        const x = -CRAFT_BAR_WIDTH / 2;

        this.craftBar.clear();
        this.craftBar
            .rect(x, CRAFT_BAR_Y, CRAFT_BAR_WIDTH, CRAFT_BAR_HEIGHT)
            .fill(CRAFT_BAR_BG);
        if (fillWidth > 0) {
            this.craftBar
                .rect(x, CRAFT_BAR_Y, fillWidth, CRAFT_BAR_HEIGHT)
                .fill(CRAFT_BAR_FILL);
        }
    }

    /**
     * Lerp fill + fade, redraw, shake. Returns true while still animating.
     */
    private tickAirRing(): boolean {
        this.airDisplay = lerp(this.airDisplay, this.air, AIR_RING_VALUE_LERP);
        const targetFade = this.air < this.airMax ? 1 : 0;
        this.airFade = lerp(this.airFade, targetFade, AIR_RING_FADE_LERP);
        if (targetFade === 0 && this.airFade < 0.01) this.airFade = 0;
        if (targetFade === 1 && this.airFade > 0.99) this.airFade = 1;

        const valueSettled = Math.abs(this.airDisplay - this.air) < 0.05;
        if (valueSettled) this.airDisplay = this.air;

        this.redrawAirRing();
        const shaking = this.tickAirRingShake();
        const fading = this.airFade > 0 && this.airFade < 1;
        return !valueSettled || fading || shaking;
    }

    private redrawAirRing(): void {
        if (this.airFade <= 0) {
            this.airRing.clear();
            this.airRing.visible = false;
            this.airRing.rotation = 0;
            return;
        }

        const ratio = this.airDisplay / this.airMax;
        const radius = this.collisionRadius * AIR_RING_RADIUS_SCALE;
        // Track goes red from low threshold down to empty; fill stays cyan.
        const lowT = Math.min(
            1,
            Math.max(0, 1 - ratio / AIR_RING_LOW_RATIO)
        );
        const trackColor = colorLerp(
            AIR_RING_COLOR,
            AIR_RING_EMPTY_TRACK,
            lowT
        );
        const trackAlpha =
            lerp(AIR_RING_TRACK_ALPHA, AIR_RING_EMPTY_TRACK_ALPHA, lowT) *
            this.airFade;
        const fillAlpha = AIR_RING_FILL_ALPHA * this.airFade;
        const stroke = {
            width: AIR_RING_WIDTH,
            cap: "round" as const,
            join: "round" as const,
        };

        this.airRing.clear();
        this.airRing.circle(0, 0, radius).stroke({
            ...stroke,
            color: trackColor,
            alpha: trackAlpha,
        });
        if (ratio > 0.001) {
            const start = -Math.PI / 2;
            const end = start + Math.PI * 2 * Math.min(1, ratio);
            this.airRing
                .moveTo(Math.cos(start) * radius, Math.sin(start) * radius)
                .arc(0, 0, radius, start, end)
                .stroke({
                    ...stroke,
                    color: AIR_RING_COLOR,
                    alpha: fillAlpha,
                });
        }
        this.airRing.visible = true;
    }

    /** Rotational shake while air is critically low. Returns true if animating. */
    private tickAirRingShake(): boolean {
        if (this.airFade <= 0) {
            this.airRing.rotation = 0;
            return false;
        }
        const ratio = this.airDisplay / this.airMax;
        if (ratio > AIR_RING_LOW_RATIO) {
            this.airRing.rotation = 0;
            return false;
        }
        const t = performance.now() / 1000;
        this.airRing.rotation =
            Math.sin(t * Math.PI * 2 * AIR_RING_SHAKE_HZ + this.airShakePhase) *
            AIR_RING_SHAKE_RAD;
        return true;
    }

    setEquipment(equipment?: Equipment) {
        if (!equipment) return;
        const items = clientRegistries().item;
        const visual = (id?: number | null) =>
            typeof id === "number" && id >= 0
                ? clientModelId(items.location(id))
                : "";
        this.mainhand = visual(equipment.mainhand);
        this.offhand = visual(equipment.offhand);
        this.helmet = visual(equipment.helmet);
        this.backpack = equipment.backpack ?? undefined;
        this.updateEquipment();
    }

    updateEquipment() {
        this.clearEquipmentVisuals();

        this.fillSlot("mainhand", this.mainhand);
        this.fillSlot("offhand", this.offhand);
        this.fillSlot("helmet", this.helmet);
        this.setBodyTexture(
            this.helmet ? BODY_WITHOUT_FEATURES : BODY_TEXTURE,
            // Hat body is unpadded 100×100; default body uses authored spillover.
            this.helmet ? 0 : undefined
        );
    }

    private setBodyTexture(texture: string, spillover?: number) {
        const body = this.parts.get("body");
        if (!body) return;
        const part = playerDef.parts.find((entry) => entry.name === "body");
        SpriteFactory.update(body.visual, undefined, texture);
        const scale = spilloverSpriteScale(
            part?.spriteScale,
            spillover ?? part?.spillover,
            body.visual.sprite.texture
        );
        body.visual.scale.set(scale);
        if (body.shadow) {
            SpriteFactory.update(body.shadow, undefined, texture);
            body.shadow.scale.set(scale);
        }
    }

    showChatMessage(message: string) {
        this.chatMessage.text = message;
        this.chatMessage.visible = true;
        clearTimeout(this.chatTimeout);
        this.chatTimeout = setTimeout(() => {
            this.chatMessage.visible = false;
        }, CHAT_MESSAGE_DURATION);
    }

    reloadModelDefinition() {
        this.clearEquipmentVisuals();
        this.animationManager.remove(this);
        for (const child of this.container.removeChildren()) {
            child.destroy({ children: true });
        }
        this.animations.clear();
        this.parts.clear();
        this.slots.clear();

        const assembled = assemble(
            playerDef,
            this.container,
            this.visualVariant
        );
        this.parts = assembled.parts;
        this.slots = assembled.slots;

        const { animations, autoplay } = bindAnimations(
            playerDef,
            this.parts,
            this
        );
        for (const [id, animation] of animations) {
            this.animations.set(id, animation);
        }
        this.updateEquipment();
        for (const id of autoplay) {
            this.trigger(id, this.animationManager);
        }

    }

    private fillSlot(slotName: string, itemId: string) {
        if (!itemId) return;
        const slot = this.slots.get(slotName);
        const attach = slot?.node.attach;
        if (!slot || !attach) return;
        const mounted = mountModel(itemId, slot.def.display, attach, {
            animationManager: this.animationManager,
            animationContext: this,
            anchor: slot.node.attachAnchor,
        });
        if (!mounted) return;
        this.slotModels.set(slotName, mounted);
        attach.visible = true;
        if (slot.def.scale != null) {
            attach.scale.set(
                slot.def.mirrorX ? -slot.def.scale : slot.def.scale,
                slot.def.scale
            );
        } else if (slot.def.mirrorX) {
            attach.scale.x = -Math.abs(attach.scale.x || 1);
        }
    }

    private clearEquipmentVisuals() {
        for (const mounted of this.slotModels.values()) mounted.destroy();
        this.slotModels.clear();
        for (const slot of this.slots.values()) {
            if (!slot.node.attach) continue;
            slot.node.attach.visible = false;
            slot.node.attach.scale.set(1);
        }
    }

    setSelectedStructure(id: number) {
        this.selectedStructureId = id > 0 ? id : 0;
        this.structureCursor = {
            x: worldToTile(this.position.x),
            y: worldToTile(this.position.y),
        };
    }

    setStructureRotation(rotation: number) {
        this.structureRotation = (((rotation % 4) + 4) % 4) as TileRot;
    }

    setStructureCursor(cursor: TilePos) {
        this.structureCursor = cursor;
    }

    /** Placement ghost selection, if any. */
    getStructureGhost(): {
        id: number;
        rotation: TileRot;
        cursor: TilePos;
    } | null {
        if (!this.selectedStructureId) return null;
        return {
            id: this.selectedStructureId,
            rotation: this.structureRotation,
            cursor: this.structureCursor,
        };
    }

    setEating(duration: number) {
        if (duration <= 0) {
            this.eating = false;
            this.eatingDuration = undefined;
            return;
        }
        this.eating = true;
        this.eatingDuration = duration;
        this.trigger("eat", this.animationManager, true);
    }

    enableParticles(emit: (burst: ParticleBurst) => void): void {
        this.emitParticles = emit;
        this.particleAnchor = () => {
            const hand = this.parts.get("rightHand");
            if (!hand) throw new Error("Player visual is missing the right hand");
            const held = this.slotModels.get("offhand")?.sprites[0];
            return {
                texture: held?.sprite.texture ?? hand.visual.sprite.texture,
                x: this.position.x,
                y: this.position.y - this.collisionRadius * 0.5,
                radius: this.collisionRadius,
            };
        };
    }

    override dispose(): void {
        clearTimeout(this.chatTimeout);
        this.clearEquipmentVisuals();
        this.animationManager.remove(this);
        super.dispose();
    }
}
