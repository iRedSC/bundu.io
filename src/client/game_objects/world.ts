import { Viewport } from "pixi-viewport";
import { AnimationManager } from "../../lib/animation";
import { WorldObject } from "./world_object";
import { PACKET } from "../../shared/enums";
import { Structure } from "./structure";
import * as PIXI from "pixi.js";
import { Player } from "./player";
import { Sky } from "./sky";
import { itemMap } from "../configs/item_map";
import { Ground } from "./ground";
import { Entity } from "./entity";
import { Schemas } from "../packet_pipline";

export class World {
    viewport: Viewport;
    animationManager: AnimationManager;
    user?: WorldObject;
    objects: Map<number, WorldObject>;
    dynamicObjs: Map<number, WorldObject>;
    updatingObjs: Map<number, WorldObject>;
    sky: Sky;

    constructor(viewport: Viewport, animationManager: AnimationManager) {
        this.viewport = viewport;
        this.sky = new Sky();
        this.animationManager = animationManager;
        this.objects = new Map();
        this.dynamicObjs = new Map();
        this.updatingObjs = new Map();

        this.viewport.addChild(this.sky);
    }

    tick() {
        this.animationManager.update();
        for (let [id, object] of this.updatingObjs.entries()) {
            object.move();
            if (object.nextState[0] < Date.now()) {
                this.updatingObjs.delete(id);
            }
        }
    }

    newStructure(_: number, packet: PACKET.NEW_STRUCTURE) {
        const id = packet[0];
        const pos = new PIXI.Point(packet[2], packet[3]);
        const structure = new Structure(
            itemMap.getv(packet[1]) || "stone",
            pos,
            packet[4],
            packet[5]
        );
        this.objects.set(id, structure);
        this.viewport.addChild(structure);
    }

    newEntity(_: number, packet: PACKET.NEW_ENTITY) {
        const id = packet[0];
        const pos = new PIXI.Point(packet[2], packet[3]);
        const structure = new Entity(
            this.animationManager,
            itemMap.getv(packet[1]) || "stone",
            pos,
            packet[4],
            packet[5]
        );
        this.objects.set(id, structure);
        this.viewport.addChild(structure);
    }

    newPlayer(packet: Schemas.newPlayer) {
        const id = packet[0];
        const pos = new PIXI.Point(packet[1], packet[2]);
        const player = new Player(
            this.animationManager,
            packet[4],
            pos,
            packet[3]
        );
        this.objects.set(id, player);
        this.dynamicObjs.set(id, player);
        this.viewport.addChild(player);
    }

    moveObject(packet: Schemas.moveObject) {
        const id = packet[0];
        const time = packet[1];

        const object = this.objects.get(id);
        if (object) {
            object.setState([time, packet[2], packet[3], packet[4]]);
            this.updatingObjs.set(id, object);
        }
    }

    setTime(_: number, packet: PACKET.SET_TIME) {
        this.sky.setTime(packet[0], this.animationManager);
    }

    loadGround(_: number, packet: PACKET.LOAD_GROUND) {
        const ground = new Ground(
            packet[1],
            packet[2],
            packet[3],
            packet[4],
            packet[5]
        );
        this.viewport.addChild(ground);
    }
}
