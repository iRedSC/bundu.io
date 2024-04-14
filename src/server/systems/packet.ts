import { ACTION, PACKET_TYPE } from "../../shared/enums.js";
import { Physics } from "../components/base.js";
import { Health } from "../components/combat.js";
import { Inventory, PlayerData } from "../components/player.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";
import { BasicPoint } from "../game_engine/types.js";
import { UpdateHandler } from "../game_objects/update_handler.js";
import { send } from "../network/send.js";
import { quadtree } from "./position.js";

export const updateHandler = new UpdateHandler();

export class PacketSystem extends System {
    constructor() {
        super([PlayerData], 20);

        this.listen("move", this.moveObject.bind(this));
        this.listen("hurt", this.hurt.bind(this));
        this.listen("collide", this.moveObject.bind(this));
        this.listen("block", this.blocking.bind(this));
        this.listen("attack", this.attack.bind(this));
        this.listen("rotate", this.rotateObject.bind(this));
        this.listen("send_new_objects", this.sendNewObjects.bind(this)),
            [PlayerData];
        this.listen("send_object_updates", this.sendUpdatedObjects.bind(this), [
            PlayerData,
        ]);
        this.listen("delete_object", this.deleteObject.bind(this));

        this.listen("update_inventory", this.sendInventory.bind(this), [
            PlayerData,
        ]);
        this.listen("update_gear", this.updateGear.bind(this), [PlayerData]);

        this.listen("send_chat", this.chatMessage.bind(this), [PlayerData]);

        this.listen("health_update", this.healthUpdate.bind(this), [
            PlayerData,
        ]);
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
                this.trigger("send_object_updates", player.id);
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
    deleteObject(object: GameObject) {
        const players = this.world.query([PlayerData.id]);
        for (const player of players) {
            const data = PlayerData.get(player)?.data;
            if (!data) {
                continue;
            }
            send(data.socket, [PACKET_TYPE.DELETE_OBJECT, object.id]);
        }
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
                [ACTION.BLOCK, object.id, stop],
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
                [ACTION.ATTACK, object.id, false],
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
        const players = this.world.query([PlayerData.id]);
        for (let other of players.values()) {
            const data = PlayerData.get(other).data;
            if (data.visibleObjects.has(player.id)) {
                const data = PlayerData.get(other)?.data;
                send(data.socket, [
                    PACKET_TYPE.UPDATE_GEAR,
                    [player.id, ...items],
                ]);
            }
        }
    }

    hurt(object: GameObject, { source }: { source: GameObject }) {
        if (object.id === source.id) {
            return;
        }
        const packet: any[] = [
            PACKET_TYPE.ACTION,
            [ACTION.HURT, object.id, false],
        ];
        const players = this.world.query([PlayerData.id]);
        for (let player of players.values()) {
            const data = PlayerData.get(player).data;
            if (data.visibleObjects.has(object.id)) {
                const data = PlayerData.get(player)?.data;
                send(data?.socket, packet);
            }
        }
    }

    chatMessage(object: GameObject, message: string) {
        const players = this.world.query([PlayerData.id]);
        for (let player of players.values()) {
            const data = PlayerData.get(player).data;
            if (data.visibleObjects.has(object.id)) {
                const data = PlayerData.get(player)?.data;
                send(data?.socket, [
                    PACKET_TYPE.CHAT_MESSAGE,
                    [object.id, message],
                ]);
            }
        }
    }

    healthUpdate(player: GameObject) {
        const health = Health.get(player).data;
        const data = PlayerData.get(player).data;
        send(data?.socket, [PACKET_TYPE.UPDATE_STATS, [health.value, 0, 0]]);
    }
}
