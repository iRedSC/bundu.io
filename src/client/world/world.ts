import { Viewport } from "pixi-viewport";
import { AnimationManager } from "../../lib/animations";
import { WorldObject } from "./objects/world_object";
import {
    ACTION,
    NewObjectSchema,
    ServerPacketSchema,
} from "../../shared/enums";
import { Structure } from "./objects/structure";
import { Player } from "./objects/player";
import { Sky } from "./sky";
import { idMap } from "../configs/id_map";
import { createGround } from "./ground";
import { Entity } from "./objects/entity";
import { Quadtree } from "../../lib/quadtree";
import { requestIds } from "../main";
import { BasicPoint } from "../../lib/types";
import { radians } from "../../lib/transforms";
import { ANIMATION } from "../animation/animations";
import { TEXT_STYLE } from "../assets/text";
import { Container, Point, Text } from "pixi.js";
import { RotationHandler } from "./rotation";
import { LayeredRenderer } from "./layered_renderer";
import { States } from "./states";
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
    update(): boolean;

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
    update(): void {
        for (const object of this.updating.values()) {
            const done = object.update();
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
    pos.x *= 10;
    pos.y *= 10;
}

// This basically controls everything on the client
// All packets (after being parsed) are sent to one of these methods
export class World {
    viewport: Viewport;

    user?: number;

    animationManager: AnimationManager;

    objects: ObjectContainer;
    renderer: LayeredRenderer;

    sky: Sky;

    constructor(viewport: Viewport, animationManager: AnimationManager) {
        this.viewport = viewport;
        this.sky = new Sky();
        this.animationManager = animationManager;

        this.renderer = new LayeredRenderer();

        const mapBounds: [BasicPoint, BasicPoint] = [
            { x: 0, y: 0 },
            { x: 200000, y: 200000 },
        ];

        this.objects = new ObjectContainer(mapBounds);

        this.viewport.addChild(this.renderer.container);
        this.viewport.addChild(this.sky);
        this.viewport.sortChildren();

        setInterval(this.hideOutOfSight.bind(this), 2000);
    }

    tick() {
        this.animationManager.update();
        this.objects.update();
    }

    setPlayer(packet?: ServerPacketSchema.startingInfo) {
        if (packet) {
            this.user = packet[0];
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
        this.viewport.follow(player.containers[0], {
            speed: 0,
            acceleration: 1,
            radius: 0,
        });
    }

    newStructure(packet: NewObjectSchema.newStructure) {
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

    newEntity(packet: NewObjectSchema.newEntity) {
        const id = packet[0];
        this.renderer.delete(id);

        const pos = new Point(packet[1], packet[2]);
        scaleCoords(pos);
        const entity = new Entity(
            id,
            this.animationManager,
            idMap.getv(packet[5]) || "stone",
            pos,
            packet[3],
            packet[4]
        );
        entity.states.set([Date.now(), pos.x, pos.y]);
        this.objects.add(entity);
        this.renderer.add(entity.id, ...entity.containers);
    }

    newPlayer(packet: NewObjectSchema.newPlayer) {
        const id = packet[0];
        this.renderer.delete(id);

        const pos = new Point(packet[1], packet[2]);
        scaleCoords(pos);
        const name = new Text(packet[4], TEXT_STYLE);
        const player = new Player(
            id,
            this.animationManager,
            name,
            pos,
            packet[3]
        );
        player.rotationProperties.duration = 50;
        this.objects.add(player);
        this.renderer.add(player.id, ...player.containers);

        if (this.user === player.id) {
            this.setPlayer([this.user]);
        }
    }

    moveObject(packet: ServerPacketSchema.moveObject) {
        const id = packet[0];
        const time = packet[1];

        const object = this.objects.get(id);
        if (!object) {
            requestIds.push(id);
            return;
        }
        object.renderable = true;
        object.states.set([Date.now() + time, packet[2] * 10, packet[3] * 10]);
        this.objects.updating.add(object);
        this.objects.add(object);
    }

    rotateObject(packet: ServerPacketSchema.rotateObject) {
        const id = packet[0];

        const object = this.objects.get(id);
        if (!object) {
            requestIds.push(id);
            return;
        }
        object.rotation = radians(packet[1]);
        this.objects.updating.add(object);
    }

    deleteObject(packet: ServerPacketSchema.deleteObject) {
        const id = packet;
        const object = this.objects.get(id);
        this.objects.delete(id);
        this.animationManager.remove(object);
        this.renderer.delete(id);
    }

    action(packet: ServerPacketSchema.action) {
        const id = packet[1];
        const stop = packet[2];
        const object = this.objects.get(id) as WorldObject;
        if (object) {
            switch (packet[0]) {
                case ACTION.ATTACK:
                    object.trigger(
                        ANIMATION.ATTACK,
                        this.animationManager,
                        true
                    );
                    break;
                case ACTION.BLOCK:
                    if (!stop) {
                        if (object instanceof Player) {
                            object.blocking = true;
                            object.trigger(
                                ANIMATION.BLOCK,
                                this.animationManager
                            );
                        }
                        break;
                    }
                    if (object instanceof Player) {
                        object.blocking = false;
                    }
                    break;
                case ACTION.HURT:
                    object.trigger(ANIMATION.HURT, this.animationManager, true);
            }
        }
    }

    updateGear(packet: ServerPacketSchema.updateGear) {
        const gear: [number, number, number, number] = [
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

    // setTime(_: number, packet: PACKET.SET_TIME) {
    //     this.sky.setTime(packet[0], this.animationManager);
    // }

    loadGround(packet: ServerPacketSchema.loadGround) {
        const ground = createGround(
            packet[4],
            packet[0] * 10,
            packet[1] * 10,
            packet[2] * 10,
            packet[3] * 10
        );
        this.renderer.add(-10, ground);
    }

    hideOutOfSight() {
        if (!this.user) {
            return;
        }
        const player = this.objects.get(this.user);
        if (player) {
            const range: [BasicPoint, BasicPoint] = [
                { x: player.position.x - 17000, y: player.position.y - 10000 },
                { x: player.position.x + 17000, y: player.position.y + 10000 },
            ];
            const query = this.objects.query(range);
            for (const object of this.objects.all()) {
                const queryObject = query.has(object.id);
                if (queryObject) {
                    if (object.renderable === false) {
                        requestIds.push(object.id);
                    }
                    continue;
                }
                object.renderable = false;
            }
        }
    }

    chatMessage(packet: ServerPacketSchema.chatMessage) {
        const player = this.objects.get(packet[0]) as any;
        if (!player) {
            return;
        }
        if (player.name) console.log(player.name.text, packet[1]);
    }
}
