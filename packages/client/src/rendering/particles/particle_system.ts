import {
    Particle,
    ParticleContainer,
    type Container,
    type Texture,
} from "pixi.js";
import type { NumberRange, ParticleBurst } from "./types";

type ActiveParticle = {
    view: Particle;
    container: ParticleContainer;
    velocityX: number;
    velocityY: number;
    gravity: number;
    friction: number;
    motionEndAt: number;
    spin: number;
    spinFriction: number;
    spinEndAt: number;
    age: number;
    lifetime: number;
    startScale: number;
    endScale: number;
    sizeEndAt: number;
};

const random = (range: NumberRange): number => {
    if (typeof range === "number") return range;
    return range[0] + Math.random() * (range[1] - range[0]);
};

export class ParticleSystem {
    private readonly containers = new Map<Texture, ParticleContainer>();
    private readonly active: ActiveParticle[] = [];

    constructor(private readonly parent: Container) {}

    burst(options: ParticleBurst): void {
        const container = this.getContainer(options.texture);
        const spread = options.spread ?? 0;

        for (let i = 0; i < options.count; i++) {
            const direction = options.direction + random([-spread / 2, spread / 2]);
            const speed = random(options.speed);
            const size = random(options.size);
            const scale = size / Math.max(options.texture.width, options.texture.height);
            const view = new Particle({
                texture: options.texture,
                x: options.x,
                y: options.y,
                anchorX: 0.5,
                anchorY: 0.5,
                rotation: Math.random() * Math.PI * 2,
                scaleX: scale,
                scaleY: scale,
            });

            container.addParticle(view);
            this.active.push({
                view,
                container,
                velocityX: Math.cos(direction) * speed,
                velocityY: Math.sin(direction) * speed,
                gravity: options.gravity ?? 0,
                friction: options.friction ?? 0,
                motionEndAt: options.motionEndAt ?? 1,
                spin: random(options.spin ?? 0),
                spinFriction: options.spinFriction ?? 0,
                spinEndAt: options.spinEndAt ?? 1,
                age: 0,
                lifetime: random(options.lifetime),
                startScale: scale,
                endScale:
                    (options.endSize ?? 0) /
                    Math.max(options.texture.width, options.texture.height),
                sizeEndAt: options.sizeEndAt ?? 1,
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
            if (progress < particle.motionEndAt) {
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

            const sizeProgress = Math.min(
                progress / Math.max(particle.sizeEndAt, Number.EPSILON),
                1
            );
            const scale =
                particle.startScale +
                (particle.endScale - particle.startScale) * sizeProgress;
            particle.view.scaleX = scale;
            particle.view.scaleY = scale;
            particle.view.alpha = 1 - progress;
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

    private getContainer(texture: Texture): ParticleContainer {
        const existing = this.containers.get(texture);
        if (existing) return existing;

        const container = new ParticleContainer({
            texture,
            dynamicProperties: {
                position: true,
                rotation: true,
                vertex: true,
                color: true,
            },
        });
        container.zIndex = 20;
        this.parent.addChild(container);
        this.containers.set(texture, container);
        return container;
    }
}
