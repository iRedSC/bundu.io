import {
    attackBoxPoints,
    attackFacingRadians,
    moveInDirection,
    radians,
} from "@bundu/shared";
import type { ServerPacket } from "@bundu/shared/packet_definitions";
import { ANIMATION, AnimationManagers } from "../animation/animations";
import { debugAttackHitbox } from "../debug/attack_hitbox";
import { Player } from "./objects/player";
import { Animal } from "./objects/animal";
import type ObjectContainer from "./object_container";
import type { ParticleSystem } from "../rendering/particles/particle_system";
import { structureHit } from "../visual/particles/structure_hit";
import { Structure } from "./objects/structure";

/** Combat visual FX packet handlers — attack, block, hurt. */
export class CombatFx {
    constructor(
        private readonly objects: ObjectContainer,
        private readonly particles: ParticleSystem
    ) {}

    attack = ({ id, start, length, width }: ServerPacket.AttackEvent) => {
        const object = this.objects.get(id);
        if (!object) return;
        object.trigger(ANIMATION.ATTACK, AnimationManagers.World, true);

        const facing =
            object instanceof Animal
                ? object.rotation
                : attackFacingRadians(object.rotation);
        const origin = moveInDirection(object.position, facing, start);
        debugAttackHitbox(attackBoxPoints(origin, facing, length, width));
    };

    block = ({ id, stop }: ServerPacket.BlockEvent) => {
        const object = this.objects.get(id);
        if (!object || !(object instanceof Player)) return;
        if (stop) {
            object.blocking = false;
            return;
        }
        object.blocking = true;
        object.trigger(ANIMATION.BLOCK, AnimationManagers.World);
    };

    hurt = ({ id, angle }: ServerPacket.HitEvent) => {
        const object = this.objects.get(id);
        if (!object) return;
        object.trigger(
            object instanceof Structure ? ANIMATION.HIT : ANIMATION.HURT,
            AnimationManagers.World,
            true
        );
        if (!(object instanceof Structure)) return;

        const hitX = object.position.x - Math.cos(angle) * object.collisionRadius;
        const hitY = object.position.y - Math.sin(angle) * object.collisionRadius;
        this.particles.burst(
            structureHit(
                object.sprite.sprite.texture,
                hitX,
                hitY,
                angle + radians(180)
            )
        );
    };
}
