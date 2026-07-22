import type {
    AmbientLeafPreset,
    DayPeriodName,
} from "@bundu/shared/client_gameplay";
import { DAY_PERIOD_NAMES } from "@bundu/shared/client_gameplay";
import type {
    GroundAmbientEmitterDef,
    GroundFxRange,
} from "@bundu/shared/ground_models";
import { parseHexColor } from "@bundu/shared/ground_models";
import { AdminPlaceKind } from "@bundu/shared/packet_definitions";
import type { Texture } from "pixi.js";
import {
    clientModelId,
    clientRegistries,
} from "../../../configs/registries";
import type { ParticleBurst } from "../../../rendering/particles/types";
import type GameObject from "../../game_object";
import { Structure } from "../../objects/structure";
import type { DecorationSprite } from "../../decoration";
import { ambientFx } from "../ambient_fx";
import { allSolidGroundModels } from "../models";
import type { GroundViewBounds } from "../types";
import { softCircleTexture } from "./circle";
import { GROUND_PARTICLE_Z } from "./foam";

export type AmbientUpdateContext = {
    now: number;
    dayPeriod: number;
    view: GroundViewBounds;
    /** Solid ground model id under a world pixel, if any. */
    solidModelAt: (worldX: number, worldY: number) => string | undefined;
    decorations: readonly DecorationSprite[];
    objects: Iterable<GameObject>;
    emitParticles: (burst: ParticleBurst) => void;
};

type Anchor = { x: number; y: number };

function sampleRange(range: GroundFxRange, t: number): number {
    if (typeof range === "number") return range;
    return range[0] + t * (range[1] - range[0]);
}

function sampleAmount(amount: GroundFxRange): number {
    if (typeof amount === "number") return Math.max(1, Math.round(amount));
    const lo = Math.ceil(Math.min(amount[0], amount[1]));
    const hi = Math.floor(Math.max(amount[0], amount[1]));
    return Math.max(1, lo + Math.floor(Math.random() * (hi - lo + 1)));
}

function randomInterval(range: readonly [number, number]): number {
    return range[0] + Math.random() * (range[1] - range[0]);
}

function periodName(period: number): DayPeriodName | undefined {
    return DAY_PERIOD_NAMES[period];
}

function periodAllowed(
    periods: readonly DayPeriodName[] | undefined,
    period: number
): boolean {
    if (!periods || periods.length === 0) return true;
    const name = periodName(period);
    return name !== undefined && periods.includes(name);
}

function windHeading(windX: number, windY: number): number {
    if (windX === 0 && windY === 0) return 0;
    return Math.atan2(windY, windX);
}

function randomInView(view: GroundViewBounds): { x: number; y: number } {
    return {
        x: view.minX + Math.random() * (view.maxX - view.minX),
        y: view.minY + Math.random() * (view.maxY - view.minY),
    };
}

function inView(x: number, y: number, view: GroundViewBounds, pad = 40): boolean {
    return (
        x >= view.minX - pad &&
        x <= view.maxX + pad &&
        y >= view.minY - pad &&
        y <= view.maxY + pad
    );
}

function burstFromEmitter(
    texture: Texture,
    x: number,
    y: number,
    emitter: GroundAmbientEmitterDef | AmbientLeafPreset,
    wind: { x: number; y: number }
): ParticleBurst {
    const t = Math.random();
    const size = sampleRange(emitter.size, t);
    const alpha = sampleRange(emitter.alpha, t);
    const direction =
        "direction" in emitter && emitter.direction !== undefined
            ? emitter.direction
            : windHeading(wind.x + emitter.gravityX, wind.y + emitter.gravity);
    return {
        texture,
        x,
        y,
        direction,
        count: sampleAmount(emitter.count),
        spread: emitter.spread,
        speed: emitter.speed,
        lifetime: emitter.lifetime,
        size,
        endSize: emitter.endSize,
        friction: emitter.friction,
        gravity: emitter.gravity + wind.y,
        gravityX: emitter.gravityX + wind.x,
        tint: parseHexColor(emitter.tint ?? "#ffffff"),
        alpha,
        alphaFadeIn: emitter.alphaFadeIn,
        alphaHold: emitter.alphaHold,
        spin: emitter.spin,
        blendMode: emitter.blendMode,
        zIndex: emitter.zIndex ?? GROUND_PARTICLE_Z,
    };
}

/**
 * Viewport-scoped biome / tree ambience. Burst params stay pack-authored;
 * this only schedules where/when to emit.
 */
export class AmbientParticles {
    private readonly nextAt = new Map<string, number>();

    update(ctx: AmbientUpdateContext): void {
        const cfg = ambientFx;
        const viewW = ctx.view.maxX - ctx.view.minX;
        const viewH = ctx.view.maxY - ctx.view.minY;
        if (viewW * viewH > cfg.particleMaxArea) return;

        const texture = softCircleTexture();
        this.tickGround(ctx, texture);
        this.tickLeaves(ctx, texture);
    }

    private tickGround(ctx: AmbientUpdateContext, texture: Texture): void {
        const wind = ambientFx.wind;
        for (const model of allSolidGroundModels()) {
            const ambient = model.ambient;
            if (!ambient) continue;
            for (const [name, emitter] of Object.entries(ambient)) {
                const key = `ground:${model.id}/${name}`;
                if (!periodAllowed(emitter.periods, ctx.dayPeriod)) {
                    this.nextAt.delete(key);
                    continue;
                }
                const due = this.nextAt.get(key) ?? 0;
                if (ctx.now < due) continue;
                this.nextAt.set(key, ctx.now + randomInterval(emitter.intervalMs));
                const point = randomInView(ctx.view);
                if (ctx.solidModelAt(point.x, point.y) !== model.id) continue;
                ctx.emitParticles(
                    burstFromEmitter(texture, point.x, point.y, emitter, wind)
                );
            }
        }
    }

    private tickLeaves(ctx: AmbientUpdateContext, texture: Texture): void {
        const wind = ambientFx.wind;
        for (const [name, preset] of Object.entries(ambientFx.leaves)) {
            const key = `leaf:${name}`;
            if (!periodAllowed(preset.periods, ctx.dayPeriod)) {
                this.nextAt.delete(key);
                continue;
            }
            const due = this.nextAt.get(key) ?? 0;
            if (ctx.now < due) continue;
            this.nextAt.set(key, ctx.now + randomInterval(preset.intervalMs));
            const anchor = this.randomLeafAnchor(ctx, preset);
            if (!anchor) continue;
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * preset.spawnRadius;
            ctx.emitParticles(
                burstFromEmitter(
                    texture,
                    anchor.x + Math.cos(angle) * radius,
                    anchor.y + Math.sin(angle) * radius,
                    preset,
                    wind
                )
            );
        }
    }

    private randomLeafAnchor(
        ctx: AmbientUpdateContext,
        preset: AmbientLeafPreset
    ): Anchor | undefined {
        const anchors: Anchor[] = [];
        const deco = this.decorationMembers(preset.decorationTag);
        if (deco) {
            for (const sprite of ctx.decorations) {
                if (!deco.has(sprite.type)) continue;
                if (!inView(sprite.x, sprite.y, ctx.view)) continue;
                anchors.push({ x: sprite.x, y: sprite.y });
            }
        }
        const resources = this.resourceMembers(preset.resourceTag);
        if (resources) {
            for (const object of ctx.objects) {
                if (!(object instanceof Structure)) continue;
                if (object.placeKind !== AdminPlaceKind.Resource) continue;
                if (!resources.has(object.type)) continue;
                const { x, y } = object.position;
                if (!inView(x, y, ctx.view)) continue;
                anchors.push({ x, y });
            }
        }
        if (anchors.length === 0) return undefined;
        return anchors[Math.floor(Math.random() * anchors.length)];
    }

    private decorationMembers(
        tag: string | undefined
    ): ReadonlySet<number> | undefined {
        if (!tag) return undefined;
        return new Set(
            clientRegistries().decoration.resolveSet(
                [tag],
                undefined,
                `ambient.leaves.${tag}`
            )
        );
    }

    private resourceMembers(
        tag: string | undefined
    ): ReadonlySet<string> | undefined {
        if (!tag) return undefined;
        const registries = clientRegistries();
        const models = new Set<string>();
        for (const id of registries.resource.resolveSet(
            [tag],
            undefined,
            `ambient.leaves.${tag}`
        )) {
            models.add(
                clientModelId("resource", registries.resource.location(id))
            );
        }
        return models;
    }
}
