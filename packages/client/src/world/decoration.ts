import { Container } from "pixi.js";
import { radians } from "@bundu/shared/transforms";
import { SpriteFactory } from "../assets/sprite_factory";
import {
    clientDecoration,
    clientModelId,
    clientRegistries,
} from "../configs/registries";
import { lookupObjectDef } from "../models/defs";

/**
 * Floor for decoration zIndex — above ground (-1e9), below entities (0+).
 * Final: `DECORATION_Z_BASE + def.z * 1_000_000 + id`.
 */
export const DECORATION_Z_BASE = -500_000_000;

export type DecorationSprite = {
    id: number;
    type: number;
    x: number;
    y: number;
    rotation: number;
    scale: number;
    container: Container;
};

/** Model id for a decoration registry location (`bundu:beach` → `decoration/beach`). */
export function decorationModelId(location: string): string {
    return `decoration/${clientModelId(location)}`;
}

function textureForType(type: number): string {
    const location = clientRegistries().decoration.location(type);
    const def = lookupObjectDef(decorationModelId(location));
    const sprite = def?.parts.find((part) => part.sprite)?.sprite;
    return sprite ?? "bundu/misc/unknown_asset.png";
}

/** Fit longest edge to `size * scale`, preserve aspect ratio. */
export function createDecoration(
    id: number,
    type: number,
    x: number,
    y: number,
    rotation: number,
    scale: number
): DecorationSprite {
    const config = clientDecoration(type);
    const container = new Container();
    container.eventMode = "none";
    container.zIndex = DECORATION_Z_BASE + config.z * 1_000_000 + id;
    container.position.set(x, y);
    container.rotation = radians(rotation);

    const sprite = SpriteFactory.build(textureForType(type));
    sprite.anchor.set(0.5);
    // SpriteFactory normalizes longest edge to 1; scale to base size × multiplier.
    const target = config.size * scale;
    sprite.scale.set(target);
    container.addChild(sprite);

    return { id, type, x, y, rotation, scale, container };
}
