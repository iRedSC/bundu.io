import { ServerPacket } from "@bundu/shared/packet_definitions";
import { ANIMATION, AnimationManagers } from "../animation/animations";
import { Player } from "./objects/player";
import type ObjectContainer from "./object_container";

/** Combat visual FX packet handlers — attack, block, hurt. */
export class CombatFx {
    constructor(private readonly objects: ObjectContainer) {}

    attack = ({ id }: ServerPacket.AttackEvent) => {
        const object = this.objects.get(id);
        if (!object) return;
        object.trigger(ANIMATION.ATTACK, AnimationManagers.World, true);
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
