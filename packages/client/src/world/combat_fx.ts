import {
    attackBoxPoints,
    attackFacingRadians,
    moveInDirection,
} from "@bundu/shared";
import { ServerPacket } from "@bundu/shared/packet_definitions";
import { ANIMATION, AnimationManagers } from "../animation/animations";
import { debugAttackHitbox } from "../debug/attack_hitbox";
import { Player } from "./objects/player";
import type ObjectContainer from "./object_container";

/** Combat visual FX packet handlers — attack, block, hurt. */
export class CombatFx {
    constructor(private readonly objects: ObjectContainer) {}

    attack = ({ id, start, length, width }: ServerPacket.AttackEvent) => {
        const object = this.objects.get(id);
        if (!object) return;
        object.trigger(ANIMATION.ATTACK, AnimationManagers.World, true);

        const facing = attackFacingRadians(object.rotation);
        const origin = moveInDirection(object.position, facing, start);
        debugAttackHitbox(attackBoxPoints(origin, facing, length, width));
    };

    block = ({ id, stop }: ServerPacket.BlockEvent) => {
        const object = this.objects.get(id);
        if (!object || !(object instanceof Player)) return;
        if (stop) return (object.blocking = false);
        object.blocking = true;
        object.trigger(ANIMATION.BLOCK, AnimationManagers.World);
    };

    hurt = ({ id }: ServerPacket.HitEvent) => {
        const object = this.objects.get(id);
        if (!object) return;
        object.trigger(ANIMATION.HURT, AnimationManagers.World, true);
    };
}
