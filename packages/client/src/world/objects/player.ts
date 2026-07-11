import { TILE_SIZE } from "@bundu/shared/tiles";
import { getStringId } from "@bundu/shared/id_map";
import { Container, Point, Text } from "pixi.js";
import GameObject from "../game_object";
import { SpriteFactory } from "../../assets/sprite_factory";
import { spriteConfigs } from "../../configs/sprite_configs";
import { AnimationManager } from "../../animation/runtime";
import { assemble } from "../../visual/assemble";
import { bindAnimations } from "../../visual/bind";
import { playerDef } from "../../visual/defs/player";
import type { AnimContext, PartNode, SlotDef } from "../../visual/types";

type nullish = undefined | null;

export interface Equipment {
    mainhand: number | nullish;
    offhand: number | nullish;
    helmet: number | nullish;
    backpack: boolean | nullish;
}

export class Player extends GameObject implements AnimContext {
    name: Text;
    parts: Map<string, PartNode>;
    private slots: Map<string, { node: PartNode; def: SlotDef }>;

    mainhand = "";
    offhand = "";
    helmet = "";
    backpack?: boolean;
    blocking = false;

    /** Client-side look prediction; snaps immediately (no lerp flicker). */
    predictLook(rotation: number): number {
        this.rotationStates.snap(rotation);
        this.container.rotation = rotation;
        return rotation;
    }

    constructor(
        id: number,
        manager: AnimationManager,
        name: Text,
        pos: Point,
        rotation: number,
        collisionRadius: number
    ) {
        super(id, pos, rotation, collisionRadius, TILE_SIZE);

        const assembled = assemble(playerDef, this.container);
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

        this.positionStates.callback = () => {
            this.name.renderable = true;
            this.container.renderable = true;
            this.debug.renderable = true;
        };
    }

    override get containers(): Container[] {
        return [this.container, this.name];
    }

    override update(_now?: number): boolean {
        const done = super.update();
        this.name.position = this.position;
        return done;
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
        if (slot.def.scale != null) attach.scale.set(slot.def.scale);
        if (slot.def.mirrorX) attach.x = -attach.x;
    }

    setSelectedStructure(id: number, visualScale: number) {
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
}
