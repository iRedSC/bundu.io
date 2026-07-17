import { Container } from "pixi.js";
import { radians } from "@bundu/shared/transforms";
import { SpriteFactory } from "../assets/sprite_factory";
import { assemble, assembleTileEntity } from "./assemble";
import { lookupContextVisual, lookupObjectDef } from "./defs";
import type { TileEntityDef, VisualContext } from "./types";

const UNKNOWN = "bundu/misc/unknown_asset.png";

function fitToSize(container: Container, maxSize: number): void {
    const bounds = container.getLocalBounds();
    const width = Math.max(bounds.width, 0.001);
    const height = Math.max(bounds.height, 0.001);
    const scale = maxSize / Math.max(width, height);
    container.scale.set(scale);
    container.pivot.set(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2
    );
}

function applyContextPose(container: Container, context: VisualContext): void {
    if (context.scale !== undefined) {
        container.scale.x *= context.scale;
        container.scale.y *= context.scale;
    }
    container.rotation = radians(context.rotation ?? 0);
}

function mountObjectDef(
    visualId: string,
    parent: Container,
    maxSize: number
): Container {
    const def = lookupObjectDef(visualId);
    if (!def) {
        const sprite = SpriteFactory.build(UNKNOWN);
        sprite.anchor.set(0.5);
        sprite.width = maxSize;
        sprite.height = maxSize;
        parent.addChild(sprite);
        return sprite;
    }

    const root = new Container();
    parent.addChild(root);
    const options = { shadows: false } as const;
    if ("tile" in def) {
        assembleTileEntity(def as TileEntityDef, root, undefined, options);
    } else {
        assemble(def, root, undefined, options);
    }
    fitToSize(root, maxSize);
    return root;
}

function clear(parent: Container): void {
    for (const child of [...parent.children]) {
        child.destroy({ children: true });
    }
}

/**
 * Mount inventory/icon display for a contextual visual id (e.g. `forest_tree`).
 * Honors `texture` or `visual` on inventory/icon contexts.
 */
export function mountSlotIcon(
    visualName: string,
    parent: Container,
    maxSize: number
): () => void {
    clear(parent);

    const contexts = lookupContextVisual(visualName)?.contexts;
    const context = contexts?.inventory ?? contexts?.icon;

    if (context?.texture) {
        const sprite = SpriteFactory.build(context.texture);
        sprite.anchor.set(0.5);
        sprite.width = maxSize;
        sprite.height = maxSize;
        parent.addChild(sprite);
        applyContextPose(sprite, context);
        return () => clear(parent);
    }

    if (context?.visual) {
        const root = mountObjectDef(context.visual, parent, maxSize);
        applyContextPose(root, context);
        return () => clear(parent);
    }

    if (lookupObjectDef(visualName)) {
        mountObjectDef(visualName, parent, maxSize);
        return () => clear(parent);
    }

    const sprite = SpriteFactory.build(UNKNOWN);
    sprite.anchor.set(0.5);
    sprite.width = maxSize;
    sprite.height = maxSize;
    parent.addChild(sprite);
    return () => clear(parent);
}
