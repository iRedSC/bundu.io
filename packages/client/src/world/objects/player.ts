import { TILE_SIZE } from "@bundu/shared/tiles";
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

export class Player extends GameObject implements AnimContext {
    name: Text;
    craftBar: Graphics;
    parts: Map<string, PartNode>;
    private slots: Map<string, { node: PartNode; def: SlotDef }>;

    mainhand = "";
    offhand = "";
    helmet = "";
    backpack?: boolean;
    blocking = false;

    private craftDuration = 0;
    private craftEndsAt = 0;
    private selectedStructureId = 0;
    private selectedStructureScale = 0;

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

        this.craftBar = new Graphics();
        this.craftBar.zIndex = 101;
        this.craftBar.visible = false;

        this.positionStates.callback = () => {
            this.name.renderable = true;
            this.craftBar.renderable = true;
            this.container.renderable = true;
            this.debug.renderable = true;
        };
    }

    override get containers(): Container[] {
        return [this.container, this.name, this.craftBar];
    }

    override update(_now?: number): boolean {
        const done = super.update();
        this.name.position = this.position;
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

    setSelectedStructure(id: number, visualScale: number) {
        this.selectedStructureId = id;
        this.selectedStructureScale = visualScale;

        const ghost = this.parts.get("placementGhost");
        if (!ghost) return;

        ghost.visual.renderable = false;
        const name = getStringId(id);
        if (!name) return;

        const config = spriteConfigs.get(name);
        if (!config) return;

        ghost.visual.renderable = true;
        SpriteFactory.update(
            ghost.visual,
            { ...config.world_display, scale: visualScale },
            name
        );
        ghost.root.pivot.set(0, -1 * ghost.visual.scale.x);
    }

    /** Placement ghost selection, if any. */
    getStructureGhost(): { id: number; scale: number } | null {
        if (!this.selectedStructureId) return null;
        return {
            id: this.selectedStructureId,
            scale: this.selectedStructureScale,
        };
    }
}
