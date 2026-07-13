import {
    TILE_SIZE,
    worldToTile,
    type TilePos,
    type TileRot,
} from "@bundu/shared";
import { getStringId } from "@bundu/shared/id_map";
import { Container, Graphics, Point, Text } from "pixi.js";
import GameObject from "../game_object";
import { SpriteFactory } from "../../assets/sprite_factory";
import { spriteConfigs } from "../../configs/sprite_configs";
import { AnimationManager } from "../../animation/runtime";
import { assemble } from "../../visual/assemble";
import { bindAnimations } from "../../visual/bind";
import { playerDef } from "../../visual/defs";
import type { AnimContext, PartNode, SlotDef } from "../../visual/types";

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

export class Player extends GameObject implements AnimContext {
    name: Text;
    chatMessage: Text;
    craftBar: Graphics;
    parts: Map<string, PartNode>;
    private slots: Map<string, { node: PartNode; def: SlotDef }>;
    private readonly animationManager: AnimationManager;
    private readonly visualVariant?: string;

    mainhand = "";
    offhand = "";
    helmet = "";
    backpack?: boolean;
    blocking = false;

    private craftDuration = 0;
    private craftEndsAt = 0;
    private chatTimeout?: ReturnType<typeof setTimeout>;
    private selectedStructureId = 0;
    private structureRotation: TileRot = 0;
    private structureCursor: TilePos = { x: 0, y: 0 };

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
        variant?: string
    ) {
        super(id, pos, rotation, collisionRadius, TILE_SIZE);

        this.animationManager = manager;
        this.visualVariant = variant;

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

        this.positionStates.callback = () => {
            this.name.renderable = true;
            this.chatMessage.renderable = true;
            this.craftBar.renderable = true;
            this.container.renderable = true;
            this.debug.renderable = true;
        };
    }

    override get containers(): Container[] {
        return [this.container, this.name, this.craftBar, this.chatMessage];
    }

    override update(_now?: number): boolean {
        const done = super.update();
        this.name.position = this.position;
        this.chatMessage.position.set(
            this.position.x,
            this.position.y + CHAT_MESSAGE_Y
        );
        this.craftBar.position = this.position;
        this.redrawCraftBar();
        // Stay in the updating set while the bar is animating.
        return done && !this.isCrafting;
    }

    /** `duration > 0` starts the overhead channel; `0` clears it. */
    setCraftProgress(duration: number) {
        if (duration <= 0) {
            this.craftDuration = 0;
            this.craftEndsAt = 0;
            this.craftBar.clear();
            this.craftBar.visible = false;
            return;
        }
        this.craftDuration = duration;
        this.craftEndsAt = Date.now() + duration;
        this.craftBar.visible = true;
        this.redrawCraftBar();
    }

    private redrawCraftBar() {
        if (this.craftDuration <= 0) return;

        const remaining = Math.max(0, this.craftEndsAt - Date.now());
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

    setEquipment(equipment?: Equipment) {
        if (!equipment) return;
        this.mainhand = getStringId(equipment.mainhand);
        this.offhand = getStringId(equipment.offhand);
        this.helmet = getStringId(equipment.helmet);
        this.backpack = equipment.backpack ?? undefined;
        this.updateEquipment();
    }

    updateEquipment() {
        for (const slot of this.slots.values()) {
            if (slot.node.attach) slot.node.attach.renderable = false;
        }

        this.fillSlot("mainhand", this.mainhand);
        this.fillSlot("offhand", this.offhand);
        this.fillSlot("helmet", this.helmet);
    }

    showChatMessage(message: string) {
        this.chatMessage.text = message;
        this.chatMessage.visible = true;
        clearTimeout(this.chatTimeout);
        this.chatTimeout = setTimeout(() => {
            this.chatMessage.visible = false;
        }, CHAT_MESSAGE_DURATION);
    }

    reloadVisualDefinition() {
        this.animationManager.remove(this);
        for (const child of this.container.removeChildren()) {
            child.destroy({ children: true });
        }
        this.animations.clear();

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

        const config = spriteConfigs.get(itemId);
        if (!config) return;

        attach.renderable = true;
        SpriteFactory.update(attach, config[slot.def.display], itemId);
        if (slot.def.scale != null) {
            attach.scale.set(
                slot.def.mirrorX ? -slot.def.scale : slot.def.scale,
                slot.def.scale
            );
        } else if (slot.def.mirrorX) {
            attach.scale.x = -Math.abs(attach.scale.x || 1);
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
}
