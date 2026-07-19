import { Container } from "pixi.js";
import { radians } from "@bundu/shared/transforms";
import { TILE_SIZE } from "@bundu/shared/tiles";
import { SpriteFactory, type ContaineredSprite } from "../assets/sprite_factory";
import { registerPartShadow } from "../rendering/shadow_layer";
import type {
    ObjectDef,
    PartDef,
    PartNode,
    SlotDef,
    TileEntityDef,
} from "./types";

export type AssembledObject = {
    parts: Map<string, PartNode>;
    slots: Map<string, { node: PartNode; def: SlotDef }>;
};

/**
 * Unit-normalized sprites use the full texture; spillover padding would shrink
 * the logical content. Scale so content matches an unpadded texture.
 */
export function spilloverSpriteScale(
    spriteScale: number | undefined,
    spillover: number | undefined,
    texture: { width: number; height: number }
): number {
    const base = spriteScale ?? 1;
    const pad = spillover ?? 0;
    if (pad <= 0) return base;
    const longest = Math.max(texture.width, texture.height);
    const content = longest - pad * 2;
    if (content <= 0) {
        throw new Error(
            `spillover ${pad} leaves no content in ${longest}px texture`
        );
    }
    return base * (longest / content);
}

/** Same silhouette as the part, solid black — posed by {@link ShadowLayer}. */
function buildShadow(
    texture: string,
    part: PartDef,
    anchor: { x: number; y: number }
): ContaineredSprite {
    const shadow = SpriteFactory.build(texture);
    shadow.anchor.set(anchor.x, anchor.y);
    shadow.scale.set(
        spilloverSpriteScale(part.spriteScale, part.spillover, shadow.sprite.texture)
    );
    shadow.sprite.tint = 0x000000;
    shadow.eventMode = "none";
    return shadow;
}

/** Build part graph under `root` from an ObjectDef. */
export function assemble(
    def: ObjectDef,
    root: Container,
    variant?: string,
    options?: AssembleOptions
): AssembledObject {
    const selectedVariant = variant ?? def.defaultVariant;
    const sprites =
        selectedVariant == null ? undefined : def.variants?.[selectedVariant];
    return assembleSprites(def, root, sprites, options);
}

export type AssembleOptions = {
    /** When false, skip ShadowLayer registration (UI icons). Default true. */
    shadows?: boolean;
};

function assembleSprites(
    def: ObjectDef,
    root: Container,
    sprites?: Record<string, string>,
    options?: AssembleOptions
): AssembledObject {
    const shadows = options?.shadows !== false;
    const parts = new Map<string, PartNode>();
    for (const part of def.parts) {
        const nodeRoot = new Container();
        const state = new Container();
        const animation = new Container();
        state.x = part.x ?? 0;
        state.y = part.y ?? 0;
        state.scale.set(part.scale ?? 1);
        state.rotation = radians(part.rotation ?? 0);
        if (part.zIndex !== undefined) nodeRoot.zIndex = part.zIndex;
        // Pivot lives on animation so presets rotate/translate around the authored origin.
        if (part.pivot) animation.pivot.set(part.pivot.x, part.pivot.y);
        state.alpha = part.alpha ?? 1;
        state.visible = part.visible ?? true;

        const sprite = sprites?.[part.name] ?? part.sprite;
        const visual = SpriteFactory.build(sprite ?? "");
        const anchor = part.anchor ?? { x: 0.5, y: 0.5 };
        visual.anchor.set(anchor.x, anchor.y);
        visual.scale.set(
            spilloverSpriteScale(
                part.spriteScale,
                part.spillover,
                visual.sprite.texture
            )
        );
        if (!sprite) visual.renderable = false;
        if (part.blendMode !== undefined) {
            // Set on root (inheritance) and the sprite — advanced blends need the renderable.
            nodeRoot.blendMode = part.blendMode;
            visual.blendMode = part.blendMode;
            visual.sprite.blendMode = part.blendMode;
        }

        let attach: PartNode["attach"];
        if (part.attach) {
            attach = new Container();
            attach.visible = false;
        }

        const shadow =
            shadows && part.shadow && sprite
                ? buildShadow(sprite, part, anchor)
                : undefined;

        nodeRoot.addChild(state);
        state.addChild(animation);

        // Default attach under visual; attachAbove on top. Shadows live on ShadowLayer.
        if (attach && !part.attachAbove) animation.addChild(attach);
        animation.addChild(visual);
        if (attach && part.attachAbove) animation.addChild(attach);
        if (shadow && part.shadow) {
            registerPartShadow(shadow, visual, state, part.shadow);
        }

        const parent = part.parent ? parts.get(part.parent)?.animation : root;
        if (!parent) {
            throw new Error(
                `ObjectDef "${def.id}": part "${part.name}" parent "${part.parent}" not found (define parents first)`
            );
        }
        parent.addChild(nodeRoot);
        parent.sortableChildren = true;

        parts.set(part.name, {
            root: nodeRoot,
            state,
            animation,
            visual,
            shadow,
            attach,
            attachAnchor: part.attachAnchor,
        });
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
    variant?: string,
    options?: AssembleOptions
): AssembledObject {
    const { width, height } = def.tile.size;
    const { origin, spillover } = def.tile;
    const selectedVariant = variant ?? def.defaultVariant;
    if (!selectedVariant) {
        throw new Error(
            `TileEntityDef "${def.id}": no variant or defaultVariant`
        );
    }
    const sprites = def.variants[selectedVariant];
    const contentWidth = width - spillover * 2;
    const contentHeight = height - spillover * 2;

    if (!sprites) {
        throw new Error(
            `TileEntityDef "${def.id}": unknown variant "${selectedVariant}"`
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

    const assembled = assembleSprites(def, root, sprites, options);
    const offsetX =
        width / 2 - (spillover + origin.x * TILE_SIZE + TILE_SIZE / 2);
    const offsetY =
        height / 2 - (spillover + origin.y * TILE_SIZE + TILE_SIZE / 2);

    for (const part of def.parts) {
        const node = assembled.parts.get(part.name);
        if (!node) continue;
        node.state.x += offsetX / TILE_SIZE;
        node.state.y += offsetY / TILE_SIZE;
        const partSpillover = part.spillover ?? spillover;
        if (partSpillover < 0) {
            throw new Error(
                `TileEntityDef "${def.id}": part "${part.name}" spillover must be non-negative`
            );
        }
        // Default: tile spillover (shared canvas). Override per-part so e.g. spikes
        // can overhang without stretching the wall/door body.
        const scale = part.spriteScale ?? 1;
        const sx = ((contentWidth + partSpillover * 2) / TILE_SIZE) * scale;
        const sy = ((contentHeight + partSpillover * 2) / TILE_SIZE) * scale;
        node.visual.scale.set(sx, sy);
        // Shadow scale follows the visual via ShadowLayer matrix sync.
    }

    return assembled;
}
