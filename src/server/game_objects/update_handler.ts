import { PACKET_TYPE } from "../../shared/enums.js";
import { send } from "../send.js";
import { Player } from "./player.js";
import { GameObject } from "../game_engine/game_object.js";
import { PlayerData } from "../components/player.js";

type UpdateTypes = PACKET_TYPE[];

/**
 * UpdateHandler deals with sending packets to players.
 * All you need to do is add objects that need send, along with which
 * packets need sent from it.
 */
export class UpdateHandler {
    objects: Map<GameObject, UpdateTypes>;

    constructor() {
        this.objects = new Map();
    }

    /**
     * Add objects to the handler with specific packets.
     * @param objects List of objects to add to the handler
     * @param types Packet types to send out of each object
     */
    public add(objects: GameObject[], types: PACKET_TYPE[]): void {
        for (const object of objects) {
            const existingTypes = this.objects.get(object);
            if (existingTypes) {
                types.push(...types);
                return;
            }
            this.objects.set(object, types);
        }
    }

    /**
     * Send packets for all objects a player can see.
     * @param player player to send packets to
     */
    send(player: Player) {
        const playerData = PlayerData.get(player).data;
        const packets: Map<PACKET_TYPE, any[]> = new Map();
        for (const [object, updateTypes] of this.objects.entries()) {
            if (!playerData.visibleObject.has(object.id)) {
                continue;
            }
            for (const updateType of updateTypes) {
                if (!object.pack[updateType]) {
                    continue;
                }
                let packet = packets.get(updateType);
                if (packet) {
                    packet.push(object.pack[updateType]());
                } else {
                    packets.set(updateType, [
                        updateType,
                        object.pack[updateType](),
                    ]);
                }
            }
        }
        for (const packet of packets.values()) {
            send(playerData.socket, packet);
        }
    }

    /**
     * Clear this handler.
     * Usually done after packets were sent to all players.
     */
    clear() {
        this.objects.clear();
    }
}
