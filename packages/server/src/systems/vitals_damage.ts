import { HitFlash } from "@bundu/shared/hit_flash";
import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import type { GameObject, World } from "../engine";
import { GameEvent } from "./event_map.js";

/** Flat damage once per vitals tick (× `ticks` if multiple periods elapsed). */
export function applyVitalsTickDamage(
    world: World,
    player: GameObject,
    damagePerTick: number,
    ticks: number,
    flash: HitFlash
): void {
    const damage = Math.round(damagePerTick * ticks);
    if (damage <= 0) return;
    world.dispatch(GameEvent.Hurt, { object: player, damage });
    world.context.worldPacketManager.emit(ServerPacket.HitEvent, {
        id: player.id,
        angle: 0,
        strength: 0,
        flash,
    });
}
