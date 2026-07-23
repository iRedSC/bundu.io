import {
    Particle,
    ParticleContainer,
    RenderTexture,
    Sprite,
    type Container,
    type Renderer,
} from "pixi.js";
import type { NumberRange, ParticleBurst } from "./types";
import { sizeEnvelope } from "./size_envelope";
import { surgeAlong } from "./surge";

type ActiveParticle = {
    view: Particle;
    container: ParticleContainer;
    originX: number;
    originY: number;
    dirX: number;
    dirY: number;
    velocityX: number;
    velocityY: number;
    gravity: number;
    gravityX: number;
    friction: number;
    motionEndAt: number;
    surgeDistance: number | undefined;
    surgeApexAt: number;
    blockedAt:
        | ((x: number, y: number, hitRadius: number) => boolean)
        | undefined;
    /** World-space radius at birth size (scales with current size). */
    hitRadius: number;
    /** When set, particle writes opaque coverage into a merge layer. */
    mergeAlpha: number | undefined;
    spin: number;
    spinFriction: number;
    spinEndAt: number;
    age: number;
    lifetime: number;
    startScale: number;
    peakScale: number | undefined;
    peakAt: number;
    endScale: number;
    sizeEndAt: number;
    startAlpha: number;
    alphaFadeIn: number;
    alphaHold: number;
};

type MergeLayer = {
    /** Detached bake source — not shown in the scene graph. */
    container: ParticleContainer;
    rt: RenderTexture;
    sprite: Sprite;
    mergeAlpha: number;
};

const MERGE_RT_MAX = 2048;

const random = (range: NumberRange): number => {
    if (typeof range === "number") return range;
    return range[0] + Math.random() * (range[1] - range[0]);
};

/** Kick a surge particle back offshore and fade it out quickly. */
function splashBack(particle: ActiveParticle): void {
    const lifeSec = Math.max(0.05, (particle.surgeApexAt * particle.lifetime) / 1000);
    const distance = particle.surgeDistance ?? 0;
    const inboundSpeed = distance / lifeSec;
    const kick = inboundSpeed * (1.15 + Math.random() * 0.55);
    const lateral = (Math.random() - 0.5) * kick * 0.45;
    // Perpendicular to surge direction for a spray fan.
    particle.velocityX = -particle.dirX * kick - particle.dirY * lateral;
    particle.velocityY = -particle.dirY * kick + particle.dirX * lateral;
    particle.surgeDistance = undefined;
    particle.blockedAt = undefined;
    particle.friction = 2.8;
    particle.gravity = 0;
    particle.gravityX = 0;
    particle.motionEndAt = 1;
    particle.startAlpha = particle.mergeAlpha !== undefined ? 1 : particle.view.alpha;
    particle.age = 0;
    particle.lifetime = 260 + Math.random() * 240;
    particle.alphaFadeIn = 0;
    particle.alphaHold = particle.mergeAlpha !== undefined ? 1 : 0.12;
    particle.startScale = Math.max(particle.view.scaleX, particle.view.scaleY);
    particle.peakScale = undefined;
    particle.endScale = particle.startScale * 0.2;
    particle.sizeEndAt = 1;
    particle.spin = (Math.random() - 0.5) * 5;
    particle.spinFriction = 1.2;
    particle.spinEndAt = 1;
}

export class ParticleSystem {
    private readonly containers = new Map<string, ParticleContainer>();
    private readonly mergeLayers = new Map<string, MergeLayer>();
    private readonly active: ActiveParticle[] = [];

    constructor(private readonly parent: Container) {}

    burst(options: ParticleBurst): void {
        const container = this.getContainer(options);
        const spread = options.spread ?? 0;
        const texSize = Math.max(
            options.texture.width,
            options.texture.height
        );
        const surge =
            options.motion?.kind === "surge" ? options.motion : undefined;
        const mergeAlpha =
            options.mergeAlpha !== undefined
                ? Math.min(1, Math.max(0, options.mergeAlpha))
                : undefined;

        for (let i = 0; i < options.count; i++) {
            const direction =
                options.direction + random([-spread / 2, spread / 2]);
            const speed = surge ? 0 : random(options.speed);
            const size = random(options.size);
            const scale = size / texSize;
            const startAlpha = mergeAlpha !== undefined ? 1 : (options.alpha ?? 1);
            const alphaFadeIn =
                mergeAlpha !== undefined
                    ? 0
                    : Math.min(1, Math.max(0, options.alphaFadeIn ?? 0));
            const alphaHold =
                mergeAlpha !== undefined
                    ? 1
                    : Math.min(
                          1,
                          Math.max(alphaFadeIn, options.alphaHold ?? 0)
                      );
            const dirX = Math.cos(direction);
            const dirY = Math.sin(direction);
            const view = new Particle({
                texture: options.texture,
                x: options.x,
                y: options.y,
                anchorX: 0.5,
                anchorY: 0.5,
                rotation: Math.random() * Math.PI * 2,
                scaleX: scale,
                scaleY: scale,
                tint: options.tint ?? 0xffffff,
                alpha: alphaFadeIn > 0 ? 0 : startAlpha,
            });

            container.addParticle(view);
            this.active.push({
                view,
                container,
                originX: options.x,
                originY: options.y,
                dirX,
                dirY,
                velocityX: dirX * speed,
                velocityY: dirY * speed,
                gravity: options.gravity ?? 0,
                gravityX: options.gravityX ?? 0,
                friction: options.friction ?? 0,
                motionEndAt: options.motionEndAt ?? 1,
                surgeDistance: surge ? random(surge.distance) : undefined,
                surgeApexAt: Math.min(0.95, Math.max(0.05, surge?.apexAt ?? 0.45)),
                blockedAt: surge ? options.blockedAt : undefined,
                hitRadius: size * 0.5,
                mergeAlpha,
                spin: random(options.spin ?? 0),
                spinFriction: options.spinFriction ?? 0,
                spinEndAt: options.spinEndAt ?? 1,
                age: 0,
                lifetime: random(options.lifetime),
                startScale: scale,
                peakScale:
                    options.peakSize !== undefined
                        ? random(options.peakSize) / texSize
                        : undefined,
                peakAt: Math.min(1, Math.max(0, options.peakAt ?? 0.35)),
                endScale: (options.endSize ?? 0) / texSize,
                sizeEndAt: options.sizeEndAt ?? 1,
                startAlpha,
                alphaFadeIn,
                alphaHold,
            });
        }
    }

    update(deltaMS: number, renderer?: Renderer): void {
        const deltaSeconds = deltaMS / 1000;
        const mergeUsed = new Set<ParticleContainer>();

        for (let i = this.active.length - 1; i >= 0; i--) {
            const particle = this.active[i];
            if (!particle) continue;
            particle.age += deltaMS;

            if (particle.age >= particle.lifetime) {
                particle.container.removeParticle(particle.view);
                this.active.splice(i, 1);
                continue;
            }

            if (particle.mergeAlpha !== undefined) {
                mergeUsed.add(particle.container);
            }

            let progress = particle.age / particle.lifetime;
            if (particle.surgeDistance !== undefined) {
                const along = surgeAlong(progress, particle.surgeApexAt);
                particle.view.x =
                    particle.originX +
                    particle.dirX * particle.surgeDistance * along;
                particle.view.y =
                    particle.originY +
                    particle.dirY * particle.surgeDistance * along;

                // Only while washing in — a hit becomes spray back + fade.
                if (
                    progress > 0.06 &&
                    progress < particle.surgeApexAt &&
                    particle.blockedAt
                ) {
                    const hitR =
                        particle.startScale > 0
                            ? particle.hitRadius *
                              (Math.max(
                                  particle.view.scaleX,
                                  particle.view.scaleY
                              ) /
                                  particle.startScale)
                            : particle.hitRadius;
                    if (
                        particle.blockedAt(
                            particle.view.x,
                            particle.view.y,
                            hitR
                        )
                    ) {
                        splashBack(particle);
                        progress = 0;
                    }
                }
            } else if (progress < particle.motionEndAt) {
                particle.velocityX += particle.gravityX * deltaSeconds;
                particle.velocityY += particle.gravity * deltaSeconds;
                const friction = Math.exp(-particle.friction * deltaSeconds);
                particle.velocityX *= friction;
                particle.velocityY *= friction;
                particle.view.x += particle.velocityX * deltaSeconds;
                particle.view.y += particle.velocityY * deltaSeconds;
            } else {
                particle.velocityX = 0;
                particle.velocityY = 0;
            }

            if (progress < particle.spinEndAt) {
                particle.spin *= Math.exp(
                    -particle.spinFriction * deltaSeconds
                );
                particle.view.rotation += particle.spin * deltaSeconds;
            } else {
                particle.spin = 0;
            }

            const scale = sizeEnvelope(
                progress,
                particle.startScale,
                particle.endScale,
                particle.peakScale,
                particle.peakAt,
                particle.sizeEndAt
            );
            particle.view.scaleX = scale;
            particle.view.scaleY = scale;

            if (particle.mergeAlpha !== undefined) {
                // Opaque coverage — shared transparency lives on the merge sprite.
                particle.view.alpha = 1;
            } else {
                const fadeIn = particle.alphaFadeIn;
                const hold = particle.alphaHold;
                let alphaMult: number;
                if (progress < fadeIn) {
                    alphaMult = fadeIn <= 0 ? 1 : progress / fadeIn;
                } else if (progress <= hold || hold >= 1) {
                    alphaMult = 1;
                } else {
                    alphaMult = Math.max(0, (1 - progress) / (1 - hold));
                }
                particle.view.alpha = particle.startAlpha * alphaMult;
            }
        }

        for (const layer of this.mergeLayers.values()) {
            if (!mergeUsed.has(layer.container) || !renderer) {
                layer.sprite.visible = false;
                continue;
            }
            this.bakeMergeLayer(layer, renderer);
        }
    }

    clear(): void {
        for (const container of this.containers.values()) {
            container.removeParticles(0, container.particleChildren.length);
        }
        this.active.length = 0;
        for (const layer of this.mergeLayers.values()) {
            layer.sprite.visible = false;
        }
    }

    destroy(): void {
        this.clear();
        for (const layer of this.mergeLayers.values()) {
            layer.sprite.removeFromParent();
            layer.sprite.destroy();
            layer.rt.destroy(true);
            layer.container.destroy();
        }
        this.mergeLayers.clear();
        for (const container of this.containers.values()) {
            if (container.destroyed) continue;
            container.removeFromParent();
            container.destroy();
        }
        this.containers.clear();
    }

    private bakeMergeLayer(layer: MergeLayer, renderer: Renderer): void {
        const particles = layer.container.particleChildren;
        if (particles.length === 0) {
            layer.sprite.visible = false;
            return;
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const particle of particles) {
            const radius =
                Math.max(Math.abs(particle.scaleX), Math.abs(particle.scaleY)) *
                Math.max(particle.texture.width, particle.texture.height) *
                0.5;
            minX = Math.min(minX, particle.x - radius);
            minY = Math.min(minY, particle.y - radius);
            maxX = Math.max(maxX, particle.x + radius);
            maxY = Math.max(maxY, particle.y + radius);
        }

        const worldW = Math.max(1, maxX - minX);
        const worldH = Math.max(1, maxY - minY);
        const scale = Math.min(1, MERGE_RT_MAX / Math.max(worldW, worldH));
        const rtW = Math.max(1, Math.ceil(worldW * scale));
        const rtH = Math.max(1, Math.ceil(worldH * scale));
        if (layer.rt.width !== rtW || layer.rt.height !== rtH) {
            layer.rt.resize(rtW, rtH);
        }

        // Detached container: local transform only, no viewport camera.
        layer.container.position.set(-minX * scale, -minY * scale);
        layer.container.scale.set(scale);

        renderer.render({
            container: layer.container,
            target: layer.rt,
            clear: true,
            clearColor: { r: 0, g: 0, b: 0, a: 0 },
        });

        layer.container.position.set(0, 0);
        layer.container.scale.set(1);

        layer.sprite.texture = layer.rt;
        layer.sprite.position.set(minX, minY);
        layer.sprite.width = worldW;
        layer.sprite.height = worldH;
        layer.sprite.alpha = layer.mergeAlpha;
        layer.sprite.visible = true;
    }

    private getContainer(options: ParticleBurst): ParticleContainer {
        const blendMode = options.blendMode ?? "normal";
        const zIndex = options.zIndex ?? 20;
        const mergeAlpha = options.mergeAlpha;
        const key =
            mergeAlpha !== undefined
                ? `${options.texture.uid}:merge:${mergeAlpha}:${zIndex}`
                : `${options.texture.uid}:${blendMode}:${zIndex}`;
        const existing = this.containers.get(key);
        if (existing) return existing;

        const container = new ParticleContainer({
            texture: options.texture,
            dynamicProperties: {
                position: true,
                rotation: true,
                vertex: true,
                color: true,
            },
        });

        if (mergeAlpha !== undefined) {
            // Keep the particle source off-stage; only the baked sprite is shown.
            const rt = RenderTexture.create({
                width: 64,
                height: 64,
                dynamic: true,
            });
            const sprite = new Sprite(rt);
            sprite.zIndex = zIndex;
            sprite.blendMode = blendMode;
            sprite.alpha = Math.min(1, Math.max(0, mergeAlpha));
            sprite.visible = false;
            this.parent.addChild(sprite);
            this.mergeLayers.set(key, {
                container,
                rt,
                sprite,
                mergeAlpha: sprite.alpha,
            });
        } else {
            container.zIndex = zIndex;
            container.blendMode = blendMode;
            this.parent.addChild(container);
        }

        this.containers.set(key, container);
        return container;
    }
}
