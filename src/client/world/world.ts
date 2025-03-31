import { AnimationManager } from "../../lib/animations";
import { SCHEMA } from "../../shared/enums";
import { Structure } from "./objects/structure";
import { Player } from "./objects/player";
import { Sky } from "./sky";
import { idMap } from "../configs/id_map";
import { createGround } from "./ground";
import { Entity } from "./objects/entity";
import { Quadtree } from "../../lib/quadtree";
import { BasicPoint } from "../../lib/types";
import { radians } from "../../lib/transforms";
import { ANIMATION, AnimationManagers } from "../animation/animations";
import { TEXT_STYLE } from "../assets/text";
import { Container, Point, Text } from "pixi.js";
import { RotationHandler } from "./rotation";
import { LayeredRenderer } from "./layered_renderer";
import { States } from "./states";
import { Pond } from "./objects/pond";
import { WORLD_SIZE } from "../constants";
import { DefaultMap } from "../../lib/default_map";
import { serverTime } from "../globals";
interface GameObject {
    id: number;

    position: BasicPoint;
    rotation: number;
    rotationProperties: RotationHandler;
    renderable: boolean;

    states: States;

    /**
     * Update the object.
     * Returns true if is done updating.
     */
    update(now: number): boolean;

    trigger(id: number, manager: AnimationManager, replace?: boolean): void;

    get containers(): Container[];
}

class ObjectContainer {
    objects: Map<number, GameObject>;
    updating: Set<GameObject>;
    quadtree: Quadtree;

    constructor(bounds: [BasicPoint, BasicPoint]) {
        this.objects = new Map();
        this.updating = new Set();
        this.quadtree = new Quadtree(new Map(), bounds, 100);
    }

    /**
     * Add an object to this container.
     * @param object Object to add to container
     */
    add(object: GameObject): void {
        this.objects.set(object.id, object);
        this.quadtree.insert(object.id, object.position);
        this.updating.add(object);
    }

    /**
     * Remove an object from this container
     * @param object Object or ID to remove from container
     */
    delete(object: GameObject | number): void {
        if (typeof object === "number") {
            const existing = this.objects.get(object);
            if (!existing) {
                return;
            }
            this.updating.delete(existing);
            this.quadtree.delete(object);
            this.objects.delete(object);
            return;
        }

        this.updating.delete(object);
        this.quadtree.delete(object.id);
        this.objects.delete(object.id);
    }

    /**
     * Update objects in the updating set.
     */
    update(now: number): void {
        for (const object of this.updating.values()) {
            const done = object.update(now);
            if (done) {
                this.updating.delete(object);
            }
        }
    }

    get(id: number) {
        return this.objects.get(id);
    }

    query(bounds: [BasicPoint, BasicPoint]) {
        return this.quadtree.query(bounds);
    }

    all() {
        return this.objects.values();
    }
}

function scaleCoords(pos: { x: number; y: number }) {
    pos.x *= 1;
    pos.y *= 1;
}

export type WorldEvent = {
    new_object: GameObject;
    object_move: GameObject;

    new_player: Player;
    user_move: { x: number; y: number };
    set_user: Player;
};

type WorldEventCallback<T extends keyof WorldEvent> = (
    ev: WorldEvent[T]
) => void;

// This basically controls everything on the client
// All packets (after being parsed) are sent to one of these methods
export class World {
    viewport: Container;

    user?: number;

    objects: ObjectContainer;
    renderer: LayeredRenderer;

    sky: Sky;

    listeners: DefaultMap<keyof WorldEvent, Function[]>;

    requestIds: Set<number>;

    constructor(viewport: Container) {
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
            this.deleteObject(object.id);
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
    }

    setPlayer(packet?: SCHEMA.SERVER.STARTING_INFO) {
        if (packet) {
            this.user = packet[0];
            console.log(packet);
            serverTime.start = packet[1];
        }
        if (!this.user) {
            return;
        }
        const player = this.objects.get(this.user);
        if (!player) {
            setTimeout(this.setPlayer.bind(this), 500);
            return;
        }
        player.rotationProperties._interpolate = false;

        this.emitEvent("set_user", player as Player);
    }

    getUser() {
        return this.objects.get(this.user ?? -1) as Player;
    }

    newStructure(packet: SCHEMA.NEW_OBJECT.STRUCTURE) {
        const id = packet[0];
        this.renderer.delete(id);

        const pos = new Point(packet[1], packet[2]);
        scaleCoords(pos);
        const structure = new Structure(
            id,
            idMap.getv(packet[4]) || "stone",
            pos,
            packet[3],
            packet[5]
        );
        this.objects.add(structure);
        this.renderer.add(structure.id, ...structure.containers);
    }

    newEntity(packet: SCHEMA.NEW_OBJECT.ENTITY) {
        const id = packet[0];
        this.renderer.delete(id);

        const pos = new Point(packet[1], packet[2]);
        scaleCoords(pos);
        const entity = new Entity(
            id,
            AnimationManagers.World,
            idMap.getv(packet[5]) || "stone",
            pos,
            packet[3],
            packet[4]
        );
        entity.states.set([Date.now(), pos.x, pos.y]);
        this.objects.add(entity);
        this.renderer.add(entity.id, ...entity.containers);
    }

    newPlayer(packet: SCHEMA.NEW_OBJECT.PLAYER) {
        const id = packet[0];
        this.renderer.delete(id);

        const pos = new Point(packet[1], packet[2]);
        scaleCoords(pos);
        const name = new Text(packet[4], TEXT_STYLE);
        const player = new Player(
            id,
            AnimationManagers.World,
            name,
            pos,
            packet[3]
        );
        player.setGear([
            packet[5] || -1,
            packet[6] || -1,
            packet[7] || -1,
            packet[10] || false,
        ]);
        player.rotationProperties.duration = 50;
        this.objects.add(player);
        this.renderer.add(player.id, ...player.containers);

        this.emitEvent("new_player", player);
    }

    newPond(packet: SCHEMA.NEW_OBJECT.POND) {
        const id = packet[0];
        this.renderer.delete(id);

        const pos = new Point(packet[1], packet[2]);
        scaleCoords(pos);
        const pond = new Pond(id, pos, packet[3], AnimationManagers.World);
        this.objects.add(pond);
        this.renderer.add(pond.id, ...pond.containers);
    }

    moveObject(packet: SCHEMA.SERVER.MOVE_OBJECT, now: number) {
        const id = packet[0];
        const time = packet[1];

        const object = this.objects.get(id);
        if (!object) {
            this.requestIds.add(id);
            return;
        }
        if (id === this.user)
            this.emitEvent("user_move", { x: packet[2], y: packet[3] });
        object.renderable = true;
        object.states.set([now, packet[2], packet[3]]);
        this.emitEvent("object_move", object);
        this.objects.updating.add(object);
        this.objects.add(object);
    }

    rotateObject(packet: SCHEMA.SERVER.ROTATE_OBJECT) {
        const id = packet[0];
        if (id === this.user) {
            return;
        }
        const object = this.objects.get(id);
        if (!object) {
            this.requestIds.add(id);
            return;
        }
        object.rotation = radians(packet[1]);
        this.objects.updating.add(object);
    }

    deleteObject(packet: SCHEMA.SERVER.DELETE_OBJECT) {
        const id = packet;
        const object = this.objects.get(id);
        this.objects.delete(id);
        AnimationManagers.World.remove(object);
        this.renderer.delete(id);
    }

    attack(id: SCHEMA.EVENT.ATTACK) {
        console.log("attack");
        const object = this.objects.get(id);
        if (!object) {
            return;
        }
        console.log("attack triggered");
        object.trigger(ANIMATION.ATTACK, AnimationManagers.World, true);
    }

    block(packet: SCHEMA.EVENT.BLOCK) {
        const id = packet[0];
        const stop = packet[1];
        const object = this.objects.get(id);
        if (!object || !(object instanceof Player)) {
            return;
        }
        if (stop) {
            object.blocking = false;
            return;
        }
        object.blocking = true;
        object.trigger(ANIMATION.BLOCK, AnimationManagers.World);
    }

    hurt(id: SCHEMA.EVENT.HURT) {
        const object = this.objects.get(id);
        if (!object) {
            return;
        }
        object.trigger(ANIMATION.HURT, AnimationManagers.World, true);
    }

    updateGear(packet: SCHEMA.SERVER.UPDATE_GEAR) {
        const gear: [number, number, number, boolean] = [
            packet[1],
            packet[2],
            packet[3],
            packet[4],
        ];
        const player = this.objects.get(packet[0]);
        if (player instanceof Player) {
            player.setGear(gear);
        }
    }
    selectStructure(packet: SCHEMA.SERVER.SELECT_STRUCTURE) {
        const structure: number = packet[0];
        const size: number = packet[1];
        console.error("IT WORKS?", structure);

        const player = this.objects.get(this.user || -1);
        if (player instanceof Player) {
            player.setSelectedStructure(structure, size);
        }
    }

    // setTime(packet: PACKET.SET_TIME) {
    //     this.sky.setTime(packet[0], this.animationManager);
    // }

    loadGround(packet: SCHEMA.SERVER.LOAD_GROUND) {
        const ground = createGround(
            packet[4],
            packet[0],
            packet[1],
            packet[2],
            packet[3]
        );
        this.renderer.add(-10, ground);
    }

    unloadObject(objects: SCHEMA.SERVER.UNLOAD_OBJECT) {
        for (const id of objects) {
            const object = this.objects.get(id);
            if (object) {
                object.renderable = false;
            }
        }
    }

    chatMessage(packet: SCHEMA.SERVER.CHAT_MESSAGE) {
        const player = this.objects.get(packet[0]) as any;
        if (!player) {
            return;
        }
        if (player.name) console.log(player.name.text, packet[1]);
    }
}
