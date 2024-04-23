import { PACKET } from "../../shared/enums.js";
import { send } from "../network/send.js";
import { Player } from "./player.js";
import { GameObject } from "../game_engine/game_object.js";
import { PlayerData } from "../components/player.js";
import { GlobalPacketFactory } from "../globals.js";

type UpdateTypes = Set<PACKET.SERVER>;

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
    public add(
        objects: IterableIterator<GameObject> | GameObject[] | GameObject,
        types: PACKET.SERVER[],
        giveList: boolean = false
    ): Map<GameObject, UpdateTypes> {
        const list = giveList ? new Map() : this.objects;
        let objectsList: GameObject[] = [];
        if (objects instanceof GameObject) {
            objectsList.push(objects);
        } else {
            objectsList = Array.from(objects);
        }
        for (const object of objectsList) {
            let existingTypes: Set<number> = list.get(object) || new Set();
            list.set(object, new Set([...types, ...existingTypes.values()]));
        }

        return list;
    }

    /**
     * Send packets for all objects a player can see.
     * @param player player to send packets to
     */
    send(
        player: Player,
        objects?: [IterableIterator<GameObject> | GameObject[], PACKET.SERVER[]]
    ) {
        let list = this.objects;
        let ignoreVisible = false;
        if (objects) {
            ignoreVisible = true;
            list = this.add(objects[0], objects[1], true)!;
        }
        const playerData = PlayerData.get(player);
        for (const [object, packetTypes] of list.entries()) {
            if (!ignoreVisible && !playerData.visibleObjects.has(object.id)) {
                continue;
            }
            for (const packetType of packetTypes.values()) {
                if (!object.pack[packetType]) {
                    continue;
                }
                GlobalPacketFactory.add(player.id, [packetType], () =>
                    object.pack[packetType]!()
                );
            }
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
