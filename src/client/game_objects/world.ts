import { Viewport } from "pixi-viewport";
import { AnimationManager } from "../../lib/animation";
import { OBJECT_ANIMATION, WorldObject } from "./world_object";
import { ACTION, Schemas } from "../../shared/enums";
import { Structure } from "./structure";
import * as PIXI from "pixi.js";
import { PLAYER_ANIMATION, Player } from "./player";
import { Sky } from "./sky";
import { itemMap } from "../configs/item_map";
import { createGround } from "./ground";
import { Entity } from "./entity";
import { animationManager } from "../animation_manager";
import { Quadtree } from "../../lib/quadtree";
import { Range } from "../../lib/range";
import { requestIds } from "../main";

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
    objects: Quadtree<WorldObject>;
    dynamicObjs: Map<number, WorldObject>;
    updatingObjs: Map<number, WorldObject>;
    sky: Sky;

    constructor(viewport: Viewport, animationManager: AnimationManager) {
        this.viewport = viewport;
        this.sky = new Sky();
        this.animationManager = animationManager;

        const mapBounds = new Range({ x: 0, y: 0 }, { x: 200000, y: 200000 });
        this.objects = new Quadtree(new Map(), mapBounds, 10);
        this.dynamicObjs = new Map();
        this.updatingObjs = new Map();
        this.size = 0;

        this.viewport.addChild(this.sky);
    }

    tick() {
        this.animationManager.update();
        for (let [id, object] of this.updatingObjs.entries()) {
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

    setPlayer(packet: Schemas.startingInfo) {
        this.user = packet[0];
        console.log(this.user);

        const player = this.dynamicObjs.get(this.user)!;
        player.rotationProperties.interpolate = false;

        this.viewport.follow(player, {
            speed: 0,
            acceleration: 1,
            radius: 0,
        });
    }

    newStructure(packet: Schemas.newStructure) {
        const id = packet[0];
        const pos = new PIXI.Point(packet[1], packet[2]);
        scaleCoords(pos);
        const structure = new Structure(
            id,
            itemMap.getv(packet[4]) || "stone",
            pos,
            packet[3],
            packet[5]
        );
        this.objects.insert(structure);
        this.viewport.addChild(structure);
    }

    newEntity(packet: Schemas.newEntity) {
        const id = packet[0];
        const pos = new PIXI.Point(packet[1], packet[2]);
        scaleCoords(pos);
        const entity = new Entity(
            id,
            this.animationManager,
            itemMap.getv(packet[5]) || "stone",
            pos,
            packet[3],
            packet[4]
        );
        entity.setState([Date.now(), pos.x, pos.y]);
        this.objects.insert(entity);
        this.viewport.addChild(entity);
    }

    newPlayer(packet: Schemas.newPlayer) {
        const id = packet[0];
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
        this.objects.insert(player);
        this.dynamicObjs.set(id, player);
        this.viewport.addChild(player);
    }

    moveObject(packet: Schemas.moveObject) {
        const id = packet[0];
        const time = packet[1];

        const object = this.objects.get(id);
        if (!object) {
            requestIds.push(id);
            return;
        }
        object.setState([Date.now() + time, packet[2] * 10, packet[3] * 10]);
        this.updatingObjs.set(id, object);
        this.objects.insert(object);
    }

    rotateObject(packet: Schemas.rotateObject) {
        const id = packet[0];

        const object = this.objects.get(id);
        if (!object) {
            requestIds.push(id);
            return;
        }
        if (id !== this.user) {
            object.setRotation(packet[1]);
            this.updatingObjs.set(id, object);
        }
    }

    deleteObject(packet: Schemas.deleteObject) {
        const id = packet[0];
        const object = this.objects.get(id);
        if (object) {
            this.viewport.removeChild(object);
            this.objects.delete(id);
            this.dynamicObjs.delete(id);
            this.updatingObjs.delete(id);
        }
    }

    action(packet: Schemas.action) {
        const id = packet[0];
        const object = this.objects.get(id) as WorldObject;
        if (object) {
            switch (packet[1]) {
                case ACTION.ATTACK:
                    object.trigger(
                        PLAYER_ANIMATION.ATTACK,
                        animationManager,
                        true
                    );
                    break;
                case ACTION.START_BLOCK:
                    if (object instanceof Player) {
                        object.blocking = true;
                        object.trigger(
                            PLAYER_ANIMATION.BLOCK,
                            animationManager
                        );
                    }
                    break;
                case ACTION.STOP_BLOCK:
                    if (object instanceof Player) {
                        object.blocking = false;
                    }
                    break;
                case ACTION.HURT:
                    object.trigger(OBJECT_ANIMATION.HURT, animationManager);
            }
        }
    }

    // setTime(_: number, packet: PACKET.SET_TIME) {
    //     this.sky.setTime(packet[0], this.animationManager);
    // }

    loadGround(packet: Schemas.loadGround) {
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
