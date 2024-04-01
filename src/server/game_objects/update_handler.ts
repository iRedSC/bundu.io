import { PACKET_TYPE } from "../../shared/enums.js";
import { send } from "../send.js";
import { WorldObject } from "./world_object.js";
import { Player } from "./player.js";

type UpdateTypes = PACKET_TYPE[];
export class UpdateHandler {
    objects: Map<WorldObject, UpdateTypes>;

    constructor() {
        this.objects = new Map();
    }

    add(objects: WorldObject[], types: PACKET_TYPE[]) {
        for (const object of objects) {
            const existingTypes = this.objects.get(object);
            if (existingTypes) {
                types.push(...types);
                return;
            }
            this.objects.set(object, types);
        }
    }

    send(player: Player) {
        const packets: Map<PACKET_TYPE, any[]> = new Map();
        for (const [object, updateTypes] of this.objects.entries()) {
            if (!player.visibleObjects.get(object.id)) {
                continue;
            }
            for (const updateType of updateTypes) {
                let packet = packets.get(updateType);
                if (packet) {
                    packet.push(...object.pack(updateType));
                } else {
                    packets.set(updateType, [
                        updateType,
                        ...object.pack(updateType),
                    ]);
                }
            }
        }
        for (const packet of packets.values()) {
            send(player.socket, packet);
        }
    }

    clear() {
        this.objects.clear();
    }
}
