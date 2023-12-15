import { Viewport } from "pixi-viewport";
import { AnimationManager } from "../../lib/animation";
import { WorldObject } from "./world_object";
import { PACKET } from "../../shared/enums";
import { Structure } from "./structure";
import * as PIXI from "pixi.js";
import { Player } from "./player";
import { Sky } from "./sky";
import { itemMap } from "../../shared/item_map";

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

    newPlayer(_: number, packet: PACKET.NEW_PLAYER) {
        const id = packet[0];
        const pos = new PIXI.Point(packet[2], packet[3]);
        const player = new Player(
            this.animationManager,
            packet[1],
            pos,
            packet[4]
        );
        this.objects.set(id, player);
        this.dynamicObjs.set(id, player);
        this.viewport.addChild(player);
    }

    moveObject(time: number, packet: PACKET.MOVE_OBJECT) {
        const id = packet[0];
        const object = this.objects.get(id);
        if (object) {
            object.setState([time, packet[1], packet[2], packet[3]]);
            this.updatingObjs.set(id, object);
        }
    }

    setTime(_: number, packet: PACKET.SET_TIME) {
        this.sky.setTime(packet[0], this.animationManager);
    }
}
