import { Container } from "pixi.js";
import { radians } from "@bundu/shared/transforms";
import { TILE_SIZE } from "@bundu/shared/tiles";
import { SpriteFactory } from "../assets/sprite_factory";
import type {
    ObjectDef,
    PartNode,
    SlotDef,
    TileEntityDef,
} from "./types";

export type AssembledObject = {
    parts: Map<string, PartNode>;
    slots: Map<string, { node: PartNode; def: SlotDef }>;
};

/** Build part graph under `root` from an ObjectDef. */
export function assemble(
    def: ObjectDef,
    root: Container,
    variant?: string
): AssembledObject {
    const sprites = variant == null ? undefined : def.variants?.[variant];
    return assembleSprites(def, root, sprites);
}

function assembleSprites(
    def: ObjectDef,
    root: Container,
    sprites?: Record<string, string>
): AssembledObject {
    const parts = new Map<string, PartNode>();
    for (const part of def.parts) {
        const nodeRoot = new Container();
        nodeRoot.x = part.x ?? 0;
        nodeRoot.y = part.y ?? 0;
        nodeRoot.scale.set(part.scale ?? 1);
        nodeRoot.rotation = radians(part.rotation ?? 0);
        if (part.zIndex !== undefined) nodeRoot.zIndex = part.zIndex;
        if (part.pivot) nodeRoot.pivot.set(part.pivot.x, part.pivot.y);

        const sprite = sprites?.[part.name] ?? part.sprite;
        const visual = SpriteFactory.build(sprite ?? "");
        const anchor = part.anchor ?? { x: 0.5, y: 0.5 };
        visual.anchor.set(anchor.x, anchor.y);
        visual.scale.set(part.spriteScale ?? 1);
        if (part.alpha !== undefined) visual.alpha = part.alpha;
        if (!sprite || part.visible === false) visual.renderable = false;

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

/** Assemble artwork authored on the TILE_SIZE pixel grid around an origin tile. */
export function assembleTileEntity(
    def: TileEntityDef,
    root: Container,
    variant: string
): AssembledObject {
    const { width, height } = def.tile.size;
    const { origin, spillover } = def.tile;
    const sprites =
        def.variantSource === "structured"
            ? def.variants[variant]
            : { [def.texturePart]: variant };
    const contentWidth = width - spillover * 2;
    const contentHeight = height - spillover * 2;

    if (!sprites) {
        throw new Error(`TileEntityDef "${def.id}": unknown variant "${variant}"`);
    }
    if (
        def.variantSource === "texture" &&
        !def.parts.some(({ name }) => name === def.texturePart)
    ) {
        throw new Error(
            `TileEntityDef "${def.id}": texturePart "${def.texturePart}" does not exist`
        );
    }
    if (
        contentWidth <= 0 ||
        contentHeight <= 0 ||
        contentWidth % TILE_SIZE !== 0 ||
        contentHeight % TILE_SIZE !== 0
    ) {
        throw new Error(
            `TileEntityDef "${def.id}": size minus spillover must be positive and divisible by ${TILE_SIZE}`
        );
    }
    if (
        !Number.isInteger(origin.x) ||
        !Number.isInteger(origin.y) ||
        origin.x < 0 ||
        origin.y < 0 ||
        origin.x >= contentWidth / TILE_SIZE ||
        origin.y >= contentHeight / TILE_SIZE
    ) {
        throw new Error(`TileEntityDef "${def.id}": origin is outside its tile grid`);
    }

    const assembled = assembleSprites(def, root, sprites);
    const offsetX =
        width / 2 - (spillover + origin.x * TILE_SIZE + TILE_SIZE / 2);
    const offsetY =
        height / 2 - (spillover + origin.y * TILE_SIZE + TILE_SIZE / 2);

    for (const part of def.parts) {
        const node = assembled.parts.get(part.name);
        if (!node) continue;
        node.root.x += offsetX / TILE_SIZE;
        node.root.y += offsetY / TILE_SIZE;
        const scale = part.spriteScale ?? 1;
        node.visual.scale.set(
            (width / TILE_SIZE) * scale,
            (height / TILE_SIZE) * scale
        );
    }

    return assembled;
}
