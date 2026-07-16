import { Container } from "pixi.js";
import { radians } from "@bundu/shared/transforms";
import type { AnimationManager } from "../animation/runtime";
import { SpriteFactory, type ContaineredSprite } from "../assets/sprite_factory";
import { assemble } from "./assemble";
import { bindAnimations } from "./bind";
import { lookupContextVisual, lookupObjectDef } from "./defs";
import {
    EMPTY_ANIM_CONTEXT,
    type AnimContext,
    type VisualContext,
} from "./types";

export type MountedVisual = {
    container: Container;
    sprites: readonly ContaineredSprite[];
    destroy(): void;
};

type MountOptions = {
    animationManager?: AnimationManager;
    animationContext?: AnimContext;
    anchor?: { x: number; y: number };
};

function applyPose(container: Container, context: VisualContext): void {
    container.position.set(context.x ?? 0, context.y ?? 0);
    container.scale.set(context.scale ?? 1);
    container.rotation = radians(context.rotation ?? 0);
    if (context.pivot) container.pivot.set(context.pivot.x, context.pivot.y);
    if (context.zIndex !== undefined) container.zIndex = context.zIndex;
}

export function mountVisualContext(
    id: string,
    name: string,
    parent: Container,
    options: MountOptions = {}
): MountedVisual | undefined {
    const context = lookupContextVisual(id)?.contexts[name];
    if (!context) return undefined;

    const container = new Container();
    applyPose(container, context);
    parent.addChild(container);

    if (context.texture) {
        const sprite = SpriteFactory.build(context.texture);
        const anchor = options.anchor ?? { x: 0.5, y: 0.5 };
        sprite.anchor.set(anchor.x, anchor.y);
        container.addChild(sprite);
        return {
            container,
            sprites: [sprite],
            destroy: () => container.destroy({ children: true }),
        };
    }

    const visual = context.visual;
    if (!visual) throw new Error(`${id}.contexts.${name}: missing visual`);
    const def = lookupObjectDef(visual);
    if (!def) {
        container.destroy();
        throw new Error(
            `${id}.contexts.${name}: missing object visual "${visual}"`
        );
    }
    const { parts } = assemble(def, container);
    const sprites = [...parts.values()].map(({ visual }) => visual);
    const manager = options.animationManager;
    if (manager) {
        const { animations, autoplay } = bindAnimations(
            def,
            parts,
            options.animationContext ?? EMPTY_ANIM_CONTEXT
        );
        for (const id of autoplay) {
            const animation = animations.get(id);
            if (animation) manager.add(container, id, animation.run());
        }
    }
    return {
        container,
        sprites,
        destroy: () => {
            manager?.remove(container);
            container.destroy({ children: true });
        },
    };
}
