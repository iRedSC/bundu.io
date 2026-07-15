import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import type { GameObject, World } from "../engine";
import { Structure } from "../game_objects/structure.js";

/** Coalesced latest-wins sync of a structure's projected states. */
export function syncStructureStates(world: World, object: GameObject): void {
    if (!(object instanceof Structure)) return;
    world.context.worldPacketManager.set(ServerPacket.SetStructureState, {
        id: object.id,
        states: object.getStateSnapshot(),
    });
}
