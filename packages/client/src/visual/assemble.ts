import { Container } from "pixi.js";
import { radians } from "@bundu/shared/transforms";
import { SpriteFactory } from "../assets/sprite_factory";
import type { ObjectDef, PartNode, SlotDef } from "./types";

export type AssembledObject = {
    parts: Map<string, PartNode>;
    slots: Map<string, { node: PartNode; def: SlotDef }>;
};

/** Build part graph under `root` from an ObjectDef. */
export function assemble(def: ObjectDef, root: Container): AssembledObject {
    const parts = new Map<string, PartNode>();

    for (const part of def.parts) {
        const nodeRoot = new Container();
        nodeRoot.x = part.x ?? 0;
        nodeRoot.y = part.y ?? 0;
        nodeRoot.scale.set(part.scale ?? 1);
        nodeRoot.rotation = radians(part.rotation ?? 0);
        if (part.zIndex !== undefined) nodeRoot.zIndex = part.zIndex;
        if (part.pivot) nodeRoot.pivot.set(part.pivot.x, part.pivot.y);

        const visual = SpriteFactory.build(part.sprite);
        const anchor = part.anchor ?? { x: 0.5, y: 0.5 };
        visual.anchor.set(anchor.x, anchor.y);
        visual.scale.set(part.spriteScale ?? 1);
        if (part.alpha !== undefined) visual.alpha = part.alpha;
        if (part.visible === false) visual.renderable = false;

        let attach: PartNode["attach"];
        if (part.attach) {
            attach = SpriteFactory.build("");
            const attachAnchor = part.attachAnchor ?? { x: 0.5, y: 0.5 };
            attach.anchor.set(attachAnchor.x, attachAnchor.y);
            attach.renderable = false;
        }

        // Default: attach under visual (item under hand). attachAbove: helmet on body.
        if (part.attachAbove) {
            nodeRoot.addChild(visual);
            if (attach) nodeRoot.addChild(attach);
        } else {
            if (attach) nodeRoot.addChild(attach);
            nodeRoot.addChild(visual);
        }

        const parent = part.parent ? parts.get(part.parent)?.root : root;
        if (!parent) {
            throw new Error(
                `ObjectDef "${def.id}": part "${part.name}" parent "${part.parent}" not found (define parents first)`
            );
        }
        parent.addChild(nodeRoot);
        parent.sortableChildren = true;

        parts.set(part.name, { root: nodeRoot, visual, attach });
    }

    const slots = new Map<string, { node: PartNode; def: SlotDef }>();
    for (const [name, slot] of Object.entries(def.slots ?? {})) {
        const node = parts.get(slot.part);
        if (!node?.attach) {
            throw new Error(
                `ObjectDef "${def.id}": slot "${name}" needs part "${slot.part}" with attach: true`
            );
        }
        slots.set(name, { node, def: slot });
    }

    return { parts, slots };
}
