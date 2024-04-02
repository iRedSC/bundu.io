import { ACTION, PACKET_TYPE } from "../../shared/enums.js";
import { Physics } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";
import { BasicPoint } from "../game_engine/types.js";
import { UpdateHandler } from "../game_objects/update_handler.js";
import { send } from "../send.js";
import { quadtree } from "./position.js";

export const updateHandler = new UpdateHandler();

export class PacketSystem extends System {
    constructor() {
        super([PlayerData], 20);

        this.listen("moved", this.moveObject);
        this.listen("blocking", this.blocking.bind(this));
        this.listen("attack", this.attack.bind(this));
        this.listen("rotated", this.rotateObject);
        this.listen("sendNewObjects", this.sendNewObjects.bind(this));
        this.listen("sendUpdatedObjects", this.sendUpdatedObjects.bind(this));
    }

    update(time: number, delta: number, player: GameObject) {
        const data = PlayerData.get(player).data;
        const physics = Physics.get(player).data;
        if (!physics) {
            return;
        }
        const bounds: [BasicPoint, BasicPoint] = [
            { x: physics.position.x - 500, y: physics.position.y - 500 },
            { x: physics.position.x + 500, y: physics.position.y + 500 },
        ];
        const nearby = quadtree.query(bounds);
        data.visibleObjects.update(nearby);

        this.trigger("sendUpdatedObjects", player.id);
    }

    public afterUpdate(time: number, objects: Set<GameObject>): void {
        for (const player of objects.values()) {
            updateHandler.send(player);
        }
        updateHandler.clear();
    }

    moveObject(objects: IterableIterator<GameObject>) {
        updateHandler.add(objects, [PACKET_TYPE.MOVE_OBJECT]);
    }

    rotateObject(objects: IterableIterator<GameObject>) {
        updateHandler.add(objects, [PACKET_TYPE.ROTATE_OBJECT]);
    }

    blocking(objects: IterableIterator<GameObject>, stop: boolean) {
        const players = this.world.query([PlayerData.id]);
        for (const object of objects) {
            for (const player of players) {
                const data = PlayerData.get(player)?.data;
                if (!data) {
                    continue;
                }
                send(data.socket, [
                    PACKET_TYPE.ACTION,
                    [object.id, ACTION.BLOCK, stop],
                ]);
            }
        }
    }

    attack(objects: IterableIterator<GameObject>) {
        const players = this.world.query([PlayerData.id]);
        for (const object of objects) {
            for (const player of players) {
                const data = PlayerData.get(player)?.data;
                if (!data) {
                    continue;
                }
                send(data.socket, [
                    PACKET_TYPE.ACTION,
                    [object.id, ACTION.ATTACK, false],
                ]);
            }
        }
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
                [PACKET_TYPE.ROTATE_OBJECT],
            ]);
            data.visibleObjects.clear();
        }
    }
}
