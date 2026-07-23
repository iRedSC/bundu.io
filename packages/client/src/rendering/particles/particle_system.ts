import {
    Particle,
    ParticleContainer,
    type Container,
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

const random = (range: NumberRange): number => {
    if (typeof range === "number") return range;
    return range[0] + Math.random() * (range[1] - range[0]);
};

export class ParticleSystem {
    private readonly containers = new Map<string, ParticleContainer>();
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

        for (let i = 0; i < options.count; i++) {
            const direction =
                options.direction + random([-spread / 2, spread / 2]);
            const speed = surge ? 0 : random(options.speed);
            const size = random(options.size);
            const scale = size / texSize;
            const startAlpha = options.alpha ?? 1;
            const alphaFadeIn = Math.min(
                1,
                Math.max(0, options.alphaFadeIn ?? 0)
            );
            const alphaHold = Math.min(
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

    update(deltaMS: number): void {
        const deltaSeconds = deltaMS / 1000;

        for (let i = this.active.length - 1; i >= 0; i--) {
            const particle = this.active[i];
            if (!particle) continue;
            particle.age += deltaMS;

            if (particle.age >= particle.lifetime) {
                particle.container.removeParticle(particle.view);
                this.active.splice(i, 1);
                continue;
            }

            const progress = particle.age / particle.lifetime;
            if (particle.surgeDistance !== undefined) {
                const along = surgeAlong(progress, particle.surgeApexAt);
                particle.view.x =
                    particle.originX + particle.dirX * particle.surgeDistance * along;
                particle.view.y =
                    particle.originY + particle.dirY * particle.surgeDistance * along;
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

    clear(): void {
        for (const container of this.containers.values()) {
            container.removeParticles(0, container.particleChildren.length);
        }
        this.active.length = 0;
    }

    destroy(): void {
        this.clear();
        for (const container of this.containers.values()) {
            container.removeFromParent();
            container.destroy();
        }
        this.containers.clear();
    }

    private getContainer(options: ParticleBurst): ParticleContainer {
        const blendMode = options.blendMode ?? "normal";
        const zIndex = options.zIndex ?? 20;
        const key = `${options.texture.uid}:${blendMode}:${zIndex}`;
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
        container.zIndex = zIndex;
        container.blendMode = blendMode;
        this.parent.addChild(container);
        this.containers.set(key, container);
        return container;
    }
}
