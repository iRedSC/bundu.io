import { Viewport } from "pixi-viewport";
import { AnimationManager } from "../../lib/animation";
import { WorldObject } from "./world_object";
import {
    ACTION,
    NewObjectSchema,
    ServerPacketSchema,
} from "../../shared/packet_enums";
import { Structure } from "./structure";
import * as PIXI from "pixi.js";
import { Player } from "./player";
import { Sky } from "./sky";
import { idMap } from "../configs/id_map";
import { createGround } from "./ground";
import { Entity } from "./entity";
import { animationManager } from "../animation_manager";
import { Quadtree } from "../../lib/quadtree";
import { requestIds } from "../main";
import { BasicPoint } from "../../lib/types";
import { radians } from "../../lib/transforms";
import { ANIMATION } from "./animations";

// TODO: This place is a freaking mess, needs a little tidying up

function scaleCoords(pos: { x: number; y: number }) {
    pos.x *= 10;
    pos.y *= 10;
}

// This basically controls everything on the client
// All packets (after being parsed) are sent to one of these methods
export class World {
    size: number;
    viewport: Viewport;
    animationManager: AnimationManager;
    user?: number;
    objects: Map<number, WorldObject>;
    quadtree: Quadtree;
    dynamicObjs: Map<number, WorldObject>;
    updatingObjs: Map<number, WorldObject>;
    sky: Sky;

    constructor(viewport: Viewport, animationManager: AnimationManager) {
        this.viewport = viewport;
        this.sky = new Sky();
        this.animationManager = animationManager;

        const mapBounds: [BasicPoint, BasicPoint] = [
            { x: 0, y: 0 },
            { x: 200000, y: 200000 },
        ];
        this.objects = new Map();
        this.quadtree = new Quadtree(new Map(), mapBounds, 10);
        this.dynamicObjs = new Map();
        this.updatingObjs = new Map();
        this.size = 0;

        this.viewport.addChild(this.sky);
    }

    tick() {
        this.animationManager.update();
        for (let [id, object] of [
            ...this.updatingObjs.entries(),
            ...this.dynamicObjs.entries(),
        ]) {
            object.move();
            const lastState = object.states[-1];
            if (!lastState) {
                continue;
            }
            if (object.states[-1][0] < Date.now()) {
                this.updatingObjs.delete(id);
            }
        }
    }

    setPlayer(packet?: ServerPacketSchema.startingInfo) {
        if (packet) {
            this.user = packet[0];
        }
        if (!this.user) {
            return;
        }
        const player = this.dynamicObjs.get(this.user);
        if (!player) {
            setTimeout(this.setPlayer.bind(this), 500);
            return;
        }
        player.rotationProperties.interpolate = false;
        this.viewport.follow(player, {
            speed: 0,
            acceleration: 1,
            radius: 0,
        });
    }

    newStructure(packet: NewObjectSchema.newStructure) {
        const id = packet[0];
        const existing = this.objects.get(id);
        if (existing) {
            this.viewport.removeChild(existing);
            this.dynamicObjs.delete(existing.id);
            this.updatingObjs.delete(existing.id);
            this.objects.delete(existing.id);
        }
        const pos = new PIXI.Point(packet[1], packet[2]);
        scaleCoords(pos);
        const structure = new Structure(
            id,
            idMap.getv(packet[4]) || "stone",
            pos,
            packet[3],
            packet[5]
        );
        this.objects.set(structure.id, structure);
        this.quadtree.insert(structure.id, structure.position);
        this.viewport.addChild(structure);
    }

    newEntity(packet: NewObjectSchema.newEntity) {
        const id = packet[0];
        const existing = this.objects.get(id);
        if (existing) {
            this.viewport.removeChild(existing);
            this.dynamicObjs.delete(existing.id);
            this.updatingObjs.delete(existing.id);
            this.objects.delete(existing.id);
        }
        const pos = new PIXI.Point(packet[1], packet[2]);
        scaleCoords(pos);
        const entity = new Entity(
            id,
            this.animationManager,
            idMap.getv(packet[5]) || "stone",
            pos,
            packet[3],
            packet[4]
        );
        entity.setState([Date.now(), pos.x, pos.y]);
        this.objects.set(entity.id, entity);
        this.quadtree.insert(entity.id, entity.position);
        this.viewport.addChild(entity);
    }

    newPlayer(packet: NewObjectSchema.newPlayer) {
        const id = packet[0];
        const existing = this.objects.get(id);
        if (existing) {
            this.viewport.removeChild(existing);
            this.dynamicObjs.delete(existing.id);
            this.updatingObjs.delete(existing.id);
            this.objects.delete(existing.id);
        }
        const pos = new PIXI.Point(packet[1], packet[2]);
        scaleCoords(pos);
        const player = new Player(
            id,
            this.animationManager,
            packet[4],
            pos,
            packet[3]
        );
        player.rotationProperties.speed = 100;
        this.objects.set(player.id, player);
        this.quadtree.insert(player.id, player.position);
        this.dynamicObjs.set(id, player);
        this.viewport.addChild(player);
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
        object.setState([Date.now() + time, packet[2] * 10, packet[3] * 10]);
        this.updatingObjs.set(id, object);
        this.quadtree.insert(object.id, object.position);
    }

    rotateObject(packet: ServerPacketSchema.rotateObject) {
        const id = packet[0];

        const object = this.objects.get(id);
        if (!object) {
            requestIds.push(id);
            return;
        }
        if (id !== this.user) {
            object.setRotation(radians(packet[1]));
            this.updatingObjs.set(id, object);
        }
    }

    deleteObject(packet: ServerPacketSchema.deleteObject) {
        const id = packet[0];
        const object = this.objects.get(id);
        if (object) {
            this.quadtree.delete(id);
            this.viewport.removeChild(object);
            this.objects.delete(id);
            this.dynamicObjs.delete(id);
            this.updatingObjs.delete(id);
        }
    }

    action(packet: ServerPacketSchema.action) {
        const id = packet[0];
        const stop = packet[2];
        const object = this.objects.get(id) as WorldObject;
        if (object) {
            switch (packet[1]) {
                case ACTION.ATTACK:
                    object.trigger(ANIMATION.ATTACK, animationManager, true);
                    break;
                case ACTION.BLOCK:
                    if (!stop) {
                        if (object instanceof Player) {
                            object.blocking = true;
                            object.trigger(ANIMATION.BLOCK, animationManager);
                        }
                        break;
                    }
                    if (object instanceof Player) {
                        object.blocking = false;
                    }
                    break;
                case ACTION.HURT:
                    object.trigger(ANIMATION.HURT, animationManager, true);
            }
        }
    }

    updateGear(packet: ServerPacketSchema.updateGear) {
        console.log("setGear");
        const gear: [number, number, number, number] = [
            packet[1],
            packet[2],
            packet[3],
            packet[4],
        ];
        const player = this.dynamicObjs.get(packet[0]);
        if (player instanceof Player) {
            player.setGear(gear);
        }
    }

    // setTime(_: number, packet: PACKET.SET_TIME) {
    //     this.sky.setTime(packet[0], this.animationManager);
    // }

    loadGround(packet: ServerPacketSchema.loadGround) {
        console.log("LOADING GROUND");
        const ground = createGround(
            packet[4],
            packet[0] * 10,
            packet[1] * 10,
            packet[2] * 10,
            packet[3] * 10
        );
        this.viewport.addChild(ground);
    }
}
