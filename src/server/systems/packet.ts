import { PACKET_TYPE } from "../../shared/enums.js";
import { PlayerData } from "../components/player.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";
import { UpdateHandler } from "../game_objects/update_handler.js";

export const updateHandler = new UpdateHandler();

export class PacketSystem extends System {
    constructor() {
        super([PlayerData], 20);

        this.listen("positionUpdate", this.moveObject);
        this.listen("sendNewObjects", this.sendNewObjects.bind(this));
        this.listen("sendUpdatedObjects", this.sendUpdatedObjects.bind(this));
    }

    update(time: number, delta: number, player: GameObject) {
        updateHandler.send(player);
        updateHandler.clear();
    }

    moveObject(objects: IterableIterator<GameObject>) {
        updateHandler.add(objects, [PACKET_TYPE.MOVE_OBJECT]);
    }

    sendNewObjects(players: IterableIterator<GameObject>, objects?: number[]) {
        if (!objects) {
            return;
        }
        for (const player of players) {
            const data = PlayerData.get(player).data;
            const newObjects = data.visibleObjects.getNew();
            const foundObjects = this.world.query([], new Set(objects));

            updateHandler.send(player, [
                foundObjects,
                [PACKET_TYPE.NEW_OBJECT],
            ]);
        }
    }
    sendUpdatedObjects(
        players: IterableIterator<GameObject>,
        objects?: number[]
    ) {
        for (const player of players) {
            const data = PlayerData.get(player).data;
            const newObjects = data.visibleObjects.getNew();
            let foundObjects;
            if (objects) {
                foundObjects = this.world.query([], new Set(objects));
            } else {
                foundObjects = this.world.query([], newObjects);
            }
            updateHandler.send(player, [
                foundObjects,
                [PACKET_TYPE.MOVE_OBJECT, PACKET_TYPE.ROTATE_OBJECT],
            ]);
            data.visibleObjects.clear();
        }
    }
}
