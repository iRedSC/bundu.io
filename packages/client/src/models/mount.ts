import { Container } from "pixi.js";
import { radians } from "@bundu/shared/transforms";
import type { AnimationManager } from "../animation/runtime";
import { SpriteFactory, type ContaineredSprite } from "../assets/sprite_factory";
import { assemble, assembleTileEntity } from "./assemble";
import { bindAnimations } from "./bind";
import { lookupModel, lookupObjectDef } from "./defs";
import {
    EMPTY_ANIM_CONTEXT,
    type AnimContext,
    type ModelDef,
    type ModelDisplay,
    type TileEntityDef,
} from "./types";
import { isTileModel, modelHasParts } from "./types";

const UNKNOWN = "bundu/misc/unknown_asset.png";

export type MountedModel = {
    container: Container;
    sprites: readonly ContaineredSprite[];
    destroy(): void;
};

export type MountOptions = {
    animationManager?: AnimationManager;
    animationContext?: AnimContext;
    anchor?: { x: number; y: number };
    /** Fit assembled/texture content into a square of this size (inventory/icon). */
    maxSize?: number;
    shadows?: boolean;
    /** Texture variant name; falls back to model defaultVariant / part sprites. */
    variant?: string;
};

function applyPose(container: Container, display: ModelDisplay): void {
    container.position.set(display.x ?? 0, display.y ?? 0);
    container.scale.set(display.scale ?? 1);
    container.rotation = radians(display.rotation ?? 0);
    if (display.pivot) container.pivot.set(display.pivot.x, display.pivot.y);
    if (display.zIndex !== undefined) container.zIndex = display.zIndex;
}

/**
 * Pose overlay after fit-to-size (inventory / ground icons).
 * World display scales (e.g. tree 1.6) stay ignored so fitted ground icons
 * don't inflate. Inventory/icon scale is applied relative to the fit.
 */
function applyDisplayOverlay(
    container: Container,
    display: ModelDisplay,
    relativeScale = false
): void {
    if (display.rotation !== undefined) {
        container.rotation = radians(display.rotation);
    }
    if (display.x !== undefined || display.y !== undefined) {
        container.position.set(display.x ?? 0, display.y ?? 0);
    }
    if (relativeScale && display.scale !== undefined) {
        container.scale.x *= display.scale;
        container.scale.y *= display.scale;
    }
}

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

function mountTexture(
    texture: string,
    parent: Container,
    options: MountOptions
): MountedModel {
    const sprite = SpriteFactory.build(texture);
    const anchor = options.anchor ?? { x: 0.5, y: 0.5 };
    sprite.anchor.set(anchor.x, anchor.y);
    if (options.maxSize !== undefined) {
        sprite.width = options.maxSize;
        sprite.height = options.maxSize;
    }
    parent.addChild(sprite);
    return {
        container: parent,
        sprites: [sprite],
        destroy: () => parent.destroy({ children: true }),
    };
}

function mountAssembled(
    def: ModelDef,
    parent: Container,
    options: MountOptions
): MountedModel {
    const assembleOptions = { shadows: options.shadows ?? true } as const;
    const { parts } = isTileModel(def)
        ? assembleTileEntity(
              def as TileEntityDef,
              parent,
              options.variant,
              assembleOptions
          )
        : assemble(def, parent, options.variant, assembleOptions);
    const sprites = [...parts.values()].map(({ visual }) => visual);

    if (options.maxSize !== undefined) {
        fitToSize(parent, options.maxSize);
    }

    const manager = options.animationManager;
    if (manager && modelHasParts(def)) {
        const { animations, autoplay } = bindAnimations(
            def,
            parts,
            options.animationContext ?? EMPTY_ANIM_CONTEXT
        );
        for (const id of autoplay) {
            const animation = animations.get(id);
            if (animation) manager.add(parent, id, animation.run());
        }
        return {
            container: parent,
            sprites,
            destroy: () => {
                manager.remove(parent);
                parent.destroy({ children: true });
            },
        };
    }

    return {
        container: parent,
        sprites,
        destroy: () => parent.destroy({ children: true }),
    };
}

function resolveDisplay(
    model: ModelDef,
    displayName: string
): ModelDisplay | undefined {
    return model.displays[displayName];
}

/**
 * Mount a model for a named display (inventory, hand, world, …).
 * All UI/world/equipment surfaces should go through this.
 */
export function mountModel(
    id: string,
    displayName: string,
    parent: Container,
    options: MountOptions = {}
): MountedModel | undefined {
    const model = lookupModel(id);
    if (!model) {
        if (options.maxSize === undefined) return undefined;
        const root = new Container();
        parent.addChild(root);
        return mountTexture(UNKNOWN, root, options);
    }

    const display = resolveDisplay(model, displayName);
    // Missing display: still render model content with identity pose when fitting
    // (inventory fallback) or when the model has its own content.
    const pose = display ?? {};
    const relativeScale =
        displayName === "inventory" || displayName === "icon";

    const root = new Container();
    parent.addChild(root);

    const applyFittedPose = () => applyDisplayOverlay(root, pose, relativeScale);
    const applyMountPose = () =>
        options.maxSize !== undefined ? applyFittedPose() : applyPose(root, pose);

    // Content resolution: display override → owning model texture/parts.
    if (pose.model) {
        const nested = lookupObjectDef(pose.model) ?? lookupModel(pose.model);
        if (!nested || nested.abstract) {
            root.destroy();
            throw new Error(
                `${id}.displays.${displayName}: missing model "${pose.model}"`
            );
        }
        if (modelHasParts(nested)) {
            const mounted = mountAssembled(nested, root, {
                ...options,
                shadows: options.shadows ?? options.maxSize === undefined,
            });
            applyMountPose();
            return {
                container: root,
                sprites: mounted.sprites,
                destroy: mounted.destroy,
            };
        }
        if (nested.texture) {
            const mounted = mountTexture(nested.texture, root, options);
            applyMountPose();
            return {
                container: root,
                sprites: mounted.sprites,
                destroy: () => {
                    mounted.destroy();
                },
            };
        }
        root.destroy();
        throw new Error(
            `${id}.displays.${displayName}.model: "${pose.model}" has no content`
        );
    }

    const texture = pose.texture ?? model.texture;
    if (texture) {
        const mounted = mountTexture(texture, root, options);
        applyMountPose();
        return {
            container: root,
            sprites: mounted.sprites,
            destroy: () => {
                root.destroy({ children: true });
            },
        };
    }

    if (modelHasParts(model)) {
        const mounted = mountAssembled(model, root, {
            ...options,
            shadows: options.shadows ?? options.maxSize === undefined,
        });
        applyMountPose();
        return {
            container: root,
            sprites: mounted.sprites,
            destroy: mounted.destroy,
        };
    }

    // Last resort unknown placeholder (inventory).
    if (options.maxSize !== undefined) {
        const mounted = mountTexture(UNKNOWN, root, options);
        return {
            container: root,
            sprites: mounted.sprites,
            destroy: () => root.destroy({ children: true }),
        };
    }

    root.destroy();
    return undefined;
}

/**
 * Mount inventory/icon display into a slot container.
 * Clears existing children; returns a disposer.
 */
export function mountSlotIcon(
    modelId: string,
    parent: Container,
    maxSize: number,
    variant?: string
): () => void {
    for (const child of [...parent.children]) {
        child.destroy({ children: true });
    }

    const model = lookupModel(modelId);
    const displayName =
        model?.displays.inventory !== undefined
            ? "inventory"
            : model?.displays.icon !== undefined
              ? "icon"
              : "inventory";

    const mounted = mountModel(modelId, displayName, parent, {
        maxSize,
        shadows: false,
        anchor: { x: 0.5, y: 0.5 },
        variant,
    });

    if (!mounted) {
        const sprite = SpriteFactory.build(UNKNOWN);
        sprite.anchor.set(0.5);
        sprite.width = maxSize;
        sprite.height = maxSize;
        parent.addChild(sprite);
    }

    return () => {
        for (const child of [...parent.children]) {
            child.destroy({ children: true });
        }
    };
}
