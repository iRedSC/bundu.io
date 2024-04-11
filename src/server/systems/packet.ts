import { ACTION, PACKET_TYPE } from "../../shared/enums.js";
import { Physics } from "../components/base.js";
import { Inventory, PlayerData } from "../components/player.js";
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

        this.listen("moved", this.moveObject.bind(this));
        this.listen("hurt", this.hurt.bind(this));
        this.listen("collided", this.moveObject.bind(this));
        this.listen("blocking", this.blocking.bind(this));
        this.listen("attack", this.attack.bind(this));
        this.listen("rotated", this.rotateObject.bind(this));
        this.listen("sendNewObjects", this.sendNewObjects.bind(this));
        this.listen("sendUpdatedObjects", this.sendUpdatedObjects.bind(this));

        this.listen("inventoryUpdate", this.sendInventory.bind(this));
        this.listen("updateGear", this.updateGear.bind(this));
    }

    update(time: number, delta: number, player: GameObject) {}

    public afterUpdate(time: number, objects: Set<GameObject>): void {
        for (const player of objects.values()) {
            const data = PlayerData.get(player).data;
            const physics = Physics.get(player).data;
            if (!physics) {
                return;
            }
            const bounds: [BasicPoint, BasicPoint] = [
                { x: physics.position.x - 1600, y: physics.position.y - 900 },
                { x: physics.position.x + 1600, y: physics.position.y + 900 },
            ];
            const nearby = quadtree.query(bounds);
            data.visibleObjects.update(nearby);
            if (data.visibleObjects.new.size > 0) {
                this.trigger("sendUpdatedObjects", player.id);
            }
            updateHandler.send(player);
        }
        updateHandler.clear();
    }

    moveObject(object: GameObject) {
        updateHandler.add(object, [PACKET_TYPE.MOVE_OBJECT]);
    }

    rotateObject(object: GameObject) {
        updateHandler.add(object, [PACKET_TYPE.ROTATE_OBJECT]);
    }

    blocking(object: GameObject, stop: boolean) {
        const players = this.world.query([PlayerData.id]);
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

    attack(object: GameObject) {
        const players = this.world.query([PlayerData.id]);
        for (const player of players) {
            const data = PlayerData.get(player)?.data;
            if (!data) {
                continue;
            }
            if (!data.visibleObjects.has(object.id)) {
                continue;
            }
            send(data.socket, [
                PACKET_TYPE.ACTION,
                [object.id, ACTION.ATTACK, false],
            ]);
        }
    }

    sendNewObjects(player: GameObject, objects?: number[]) {
        if (!objects) {
            return;
        }
        const foundObjects = this.world.query([], new Set(objects));

        updateHandler.send(player, [
            foundObjects.values(),
            [PACKET_TYPE.NEW_OBJECT],
        ]);
    }
    sendUpdatedObjects(player: GameObject) {
        const data = PlayerData.get(player).data;
        const newObjects = data.visibleObjects.getNew();
        const objects = this.world.query([], newObjects);
        updateHandler.send(player, [
            objects.values(),
            [PACKET_TYPE.MOVE_OBJECT, PACKET_TYPE.ROTATE_OBJECT],
        ]);
        data.visibleObjects.clear();
    }

    sendInventory(object: GameObject) {
        const data = PlayerData.get(object)?.data;
        if (!data) {
            return;
        }
        const inventory = Inventory.get(object).data;
        send(data.socket, [
            PACKET_TYPE.UPDATE_INVENTORY,
            [inventory.slots, Array.from(inventory.items.entries())],
        ]);
    }

    updateGear(player: GameObject, items: [number, number, number, number]) {
        const data = PlayerData.get(player)?.data;
        if (!data) {
            return;
        }
        send(data.socket, [PACKET_TYPE.UPDATE_GEAR, [player.id, ...items]]);
    }

    hurt(object: GameObject, source: GameObject) {
        if (object.id === source.id) {
            return;
        }
        const packet: any[] = [
            PACKET_TYPE.ACTION,
            [object.id, ACTION.HURT, false],
        ];
        const players = this.world.query([PlayerData.id]);
        for (let player of players.values()) {
            const data = PlayerData.get(player)?.data;
            send(data?.socket, packet);
        }
    }
}
