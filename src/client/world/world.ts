import { Viewport } from "pixi-viewport";
import { AnimationManager } from "../../lib/animations";
import { WorldObject } from "./objects/world_object";
import {
    ACTION,
    NewObjectSchema,
    ServerPacketSchema,
} from "../../shared/enums";
import { Structure } from "./objects/structure";
import * as PIXI from "pixi.js";
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

// TODO: This place is a freaking mess, needs a little tidying up

function scaleCoords(pos: { x: number; y: number }) {
    pos.x *= 10;
    pos.y *= 10;
}

// This basically controls everything on the client
// All packets (after being parsed) are sent to one of these methods
export class World {
    viewport: Viewport;
    names: { container: PIXI.Container; values: Map<number, PIXI.Text> };
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

        this.names = {
            container: new PIXI.Container(),
            values: new Map(),
        };
        this.viewport.addChild(this.names.container);
        this.names.container.zIndex = 10;
        this.viewport.sortChildren();

        this.viewport.addChild(this.sky);

        setInterval(this.hideOutOfSight.bind(this), 2000);
    }

    tick() {
        this.animationManager.update();
        for (let [id, object] of [
            ...this.updatingObjs.entries(),
            ...this.dynamicObjs.entries(),
        ]) {
            object.interpolate();
            const lastState = object.states.values[-1];
            if (!lastState) {
                continue;
            }
            if (object.states.values[-1][0] < Date.now()) {
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
        player.rotationProperties._interpolate = false;
        this.viewport.follow(player.container, {
            speed: 0,
            acceleration: 1,
            radius: 0,
        });
    }

    newStructure(packet: NewObjectSchema.newStructure) {
        const id = packet[0];
        const existing = this.objects.get(id);
        if (existing) {
            this.viewport.removeChild(existing.container);
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
        this.viewport.addChild(structure.container);
    }

    newEntity(packet: NewObjectSchema.newEntity) {
        const id = packet[0];
        const existing = this.objects.get(id);
        if (existing) {
            this.viewport.removeChild(existing.container);
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
        entity.states.set([Date.now(), pos.x, pos.y]);
        this.objects.set(entity.id, entity);
        this.quadtree.insert(entity.id, entity.position);
        this.viewport.addChild(entity.container);
    }

    newPlayer(packet: NewObjectSchema.newPlayer) {
        const id = packet[0];
        const existing = this.objects.get(id);
        if (existing) {
            this.viewport.removeChild(existing.container);
            this.dynamicObjs.delete(existing.id);
            this.updatingObjs.delete(existing.id);
            this.objects.delete(existing.id);
        }
        const pos = new PIXI.Point(packet[1], packet[2]);
        scaleCoords(pos);
        const name = new PIXI.Text(packet[4], TEXT_STYLE);
        const player = new Player(
            id,
            this.animationManager,
            name,
            pos,
            packet[3]
        );
        this.names.container.addChild(name);
        this.names.values.set(player.id, name);
        player.rotationProperties.duration = 100;
        this.objects.set(player.id, player);
        this.quadtree.insert(player.id, player.position);
        this.dynamicObjs.set(id, player);
        this.viewport.addChild(player.container);
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
        object.container.renderable = true;
        object.states.set([Date.now() + time, packet[2] * 10, packet[3] * 10]);
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
        object.setRotation(radians(packet[1]));
        this.updatingObjs.set(id, object);
    }

    deleteObject(packet: ServerPacketSchema.deleteObject) {
        const id = packet[0];
        const object = this.objects.get(id);
        if (object) {
            this.quadtree.delete(id);
            this.viewport.removeChild(object.container);
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
        const player = this.dynamicObjs.get(packet[0]);
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
        this.viewport.addChild(ground);
    }

    hideOutOfSight() {
        if (!this.user) {
            return;
        }
        const player = this.objects.get(this.user);
        if (player) {
            const range: [BasicPoint, BasicPoint] = [
                { x: player.position.x - 16000, y: player.position.y - 9000 },
                { x: player.position.x + 16000, y: player.position.y + 9000 },
            ];
            const query = this.quadtree.query(range);
            for (const object of this.objects.values()) {
                const queryObject = query.has(object.id);
                if (queryObject) {
                    if (object.container.renderable === false) {
                        requestIds.push(object.id);
                    }
                    continue;
                }
                const name = this.names.values.get(object.id);
                if (name) {
                    name.renderable = false;
                }
                object.container.renderable = false;
                object.debug.renderable = false;
            }
        }
    }

    chatMessage(packet: ServerPacketSchema.chatMessage) {
        const player = this.objects.get(packet[0]) as Player;
        if (!player) {
            return;
        }
        console.log(player.name.text, packet[1]);
    }
}
