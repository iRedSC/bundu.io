import { ServerPacket } from "@shared/packet_definitions";
import { Player } from "./objects/player";
import { Sky } from "./sky";
import { createGround } from "./ground";
import { radians, type BasicPoint } from "@ioengine/lib";
import { ANIMATION, AnimationManagers } from "../animation/animations";
import { TEXT_STYLE } from "../assets/text";
import { Container, Point, Text } from "pixi.js";
import { LayeredRenderer } from "@client/rendering/layered_renderer";
import { WORLD_SIZE } from "@client/constants";
import { DefaultMap } from "../../../ioengine/lib/default_map";
import { serverTime } from "@client/globals";
import GameObject from "./game_object";
import ObjectContainer from "./object_container";
import { Camera } from "@client/rendering/basic_camera";
import { GameObjectData } from "@shared/object_types";
import typia from "typia";
import { Structure } from "./objects/structure";
import { getStringId } from "@client/configs/id_map";

export const WorldEvent = {
    ObjectLoaded: 1,
    ObjectPositionChanged: 2,
    PlayerLoaded: 3,
    ClientPlayerPositionChanged: 4,
    ClientConnected: 5,
};

export type WorldEvent = {
    [WorldEvent.ObjectLoaded]: GameObject;
    [WorldEvent.ObjectPositionChanged]: GameObject;

    [WorldEvent.PlayerLoaded]: Player;
    [WorldEvent.ClientPlayerPositionChanged]: { x: number; y: number };
    [WorldEvent.ClientConnected]: Player;
};

type WorldEventCallback<T extends keyof WorldEvent> = (
    ev: WorldEvent[T]
) => void;

// This basically controls everything on the client
// All packets (after being parsed) are sent to one of these methods
export class World {
    // camera: Camera;
    viewport: Container;
    user?: number;
    objects: ObjectContainer;
    renderer: LayeredRenderer;
    sky: Sky;
    listeners: DefaultMap<keyof WorldEvent, Function[]>;
    requestIds: Set<number>;

    constructor(viewport: Container) {
        // this.camera = new Camera(viewport, {
        //     zoomSpeed: 0.05,
        //     minZoom: 0.75,
        //     maxZoom: 2.5,
        //     padding: 100,
        //     speed: 100,
        //     peek: 0.01,
        // });

        this.requestIds = new Set();
        this.listeners = new DefaultMap(() => []);
        this.viewport = viewport;
        this.sky = new Sky();
        this.renderer = new LayeredRenderer();

        const mapBounds: [BasicPoint, BasicPoint] = [
            { x: 0, y: 0 },
            { x: WORLD_SIZE, y: WORLD_SIZE },
        ];

        this.objects = new ObjectContainer(mapBounds);

        this.viewport.addChild(this.renderer.container);
        this.viewport.addChild(this.sky);
        this.viewport.sortChildren();
    }

    clear() {
        for (const object of this.objects.all()) {
            this.deleteObjects({ objects: [object.id] });
            this.objects.delete(object.id);
        }
    }

    addEventListener<T extends keyof WorldEvent>(
        event: T,
        callback: WorldEventCallback<T>
    ) {
        this.listeners.get(event).push(callback);
    }

    removeEventListener<T extends keyof WorldEvent>(
        event: T,
        callback: WorldEventCallback<T>
    ) {
        this.listeners.set(
            event,
            this.listeners.get(event).filter((cb) => cb !== callback)
        );
    }

    emitEvent<T extends keyof WorldEvent>(event: T, data: WorldEvent[T]) {
        this.listeners.get(event).forEach((cb) => cb(data));
    }

    tick() {
        AnimationManagers.World.update();
        this.objects.update(serverTime.now());
        // this.camera.update();
    }

    clientConnectionInfo = (packet?: ServerPacket.ClientConnectionInfo) => {
        if (packet) {
            this.user = packet.playerId;
        }
        if (!this.user) return;

        const player = this.objects.get(this.user);
        if (!player) {
            console.warn(
                `No player with id ${this.user} found in world, retrying..`
            );
            return setTimeout(this.clientConnectionInfo, 500);
        }
        console.info(`Found user (id ${this.user}), loading..`);

        // this.camera.target = player.position;
        // this.camera.snap();
        console.debug("Snapping camera..");

        this.emitEvent(WorldEvent.ClientConnected, player as Player);
    };

    getUser() {
        return this.objects.get(this.user ?? -1) as Player;
    }

    loadObject = (packet: ServerPacket.LoadObject) => {
        switch (packet.type) {
            case GameObjectData.PlayerType:
                this.newPlayer(packet);
                break;
            case GameObjectData.ResourceNodeType:
                this.newStructure(packet);
                break;
        }
    };

    newPlayer = (packet: ServerPacket.LoadObject) => {
        if (!typia.is<GameObjectData.PlayerData>(packet.data)) {
            console.log(packet.data);
            return console.error(
                `Tried to load player (ID: ${packet.id}) had a bad data property. [${packet.data}]`
            );
        }
        const [name, mainhand, offhand, helmet, backpack, playerSkin] =
            packet.data;
        const id = packet.id;
        this.renderer.delete(id);
        console.log(`Loading new player with id: ${id}`);

        const pos = new Point(packet.x, packet.y);
        const nameText = new Text(name, TEXT_STYLE);

        const player = new Player(
            id,
            AnimationManagers.World,
            nameText,
            pos,
            packet.rotation
        );

        player.setEquipment({ mainhand, offhand, helmet, backpack });
        this.objects.add(player);
        this.renderer.add(player.id, ...player.containers);
        this.emitEvent(WorldEvent.PlayerLoaded, player);
    };

    newStructure = (packet: ServerPacket.LoadObject) => {
        if (!typia.is<GameObjectData.ResourceNodeData>(packet.data)) {
            console.log(packet.data);
            return console.error(
                `Tried to load player (ID: ${packet.id}) had a bad data property. [${packet.data}]`
            );
        }
        const [size, nodeType] = packet.data;
        this.renderer.delete(packet.id);

        const pos = new Point(packet.x, packet.y);

        const structure = new Structure(
            packet.id,
            getStringId(nodeType),
            pos,
            packet.rotation,
            size
        );
        this.objects.add(structure);
        this.renderer.add(structure.id, ...structure.containers);
        this.emitEvent(WorldEvent.ObjectLoaded, structure);
    };

    moveObject = (packet: ServerPacket.SetPosition, now: number) => {
        const id = packet.id;
        const state = { timestamp: now, x: packet.x, y: packet.y };

        const object = this.objects.get(id);
        if (!object) {
            this.requestIds.add(id);
            return;
        }
        if (id === this.user)
            this.emitEvent(WorldEvent.ClientPlayerPositionChanged, state);
        object.renderable = true;
        object.addState(state);

        this.emitEvent(WorldEvent.ObjectPositionChanged, object);
        this.objects.updating.add(object);
        this.objects.add(object);
    };

    rotateObject = (packet: ServerPacket.SetRotation, now: number) => {
        const id = packet.id;
        const state = { timestamp: now, rotation: radians(packet.rotation) };
        if (id === this.user) return;

        const object = this.objects.get(id);
        if (!object) return this.requestIds.add(id);

        object.addState(state.rotation);
        this.objects.updating.add(object);
    };

    deleteObjects = ({ objects }: ServerPacket.DeleteObjects) => {
        for (const id of objects) {
            const object = this.objects.get(id);
            this.objects.delete(id);
            AnimationManagers.World.remove(object);
            this.renderer.delete(id);
        }
    };

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

    hurt = ({ id, angle }: ServerPacket.HitEvent) => {
        const object = this.objects.get(id);
        if (!object) return;
        object.trigger(ANIMATION.HURT, AnimationManagers.World, true);
    };

    updateEquipment = (packet: ServerPacket.UpdateEquipment) => {
        const player = this.objects.get(packet.id);
        if (player instanceof Player) {
            player.setEquipment(packet);
        }
    };

    selectStructure = (packet: ServerPacket.SetSelectedStructure) => {
        const player = this.objects.get(this.user || -1);
        if (player instanceof Player) {
            player.setSelectedStructure(
                packet.structureId,
                packet.structureSize
            );
        }
    };

    loadGround = (packet: ServerPacket.LoadGround) => {
        for (const data of packet.groundData) {
            const ground = createGround(...data);
            this.renderer.add(-10, ground);
        }
    };

    unloadObject = ({ objects }: ServerPacket.UnloadObjects) => {
        for (const id of objects) {
            const object = this.objects.get(id);
            if (object) {
                object.renderable = false;
            }
        }
    };

    chatMessage = ({ id, message }: ServerPacket.ChatMessage) => {
        const player = this.objects.get(id) as any;
        if (!player) return;
        if (player.name) console.log(player.name.text, message);
    };
}
