import { Viewport } from "pixi-viewport";
import { AnimationManager } from "../../lib/animation";
import { WorldObject } from "./world_object";
import { Schemas } from "../../shared/enums";
import { Structure } from "./structure";
import * as PIXI from "pixi.js";
import { PLAYER_ANIMATION, Player } from "./player";
import { Sky } from "./sky";
import { itemMap } from "../configs/item_map";
import { createGround } from "./ground";
import { Entity } from "./entity";
import { animationManager } from "../animation_manager";

// TODO: This place is a freaking mess, needs a little tidying up

// Currently events (attack and block) are client side only
// TODO: Remove this and make it send event requests
function createClickEvents(viewport: Viewport, player: Player) {
    viewport.on("pointerdown", (event) => {
        if (event.button == 2) {
            player.blocking = true;
            player.trigger(PLAYER_ANIMATION.BLOCK, animationManager);
        } else {
            player.trigger(PLAYER_ANIMATION.ATTACK, animationManager);
        }
    });

    viewport.on("pointerup", (event) => {
        if (event.button == 2) {
            player.blocking = false;
        }
    });
}

function scaleCoords(pos: { x: number; y: number }) {
    pos.x *= 10;
    pos.y *= 10;
}

// This basically controls everything on the client
// All packets (after being parsed) are sent to one of these methods
export class World {
    viewport: Viewport;
    animationManager: AnimationManager;
    user?: number;
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
        player.interpolateRotation = false;

        this.viewport.follow(player, {
            speed: 0,
            acceleration: 1,
            radius: 0,
        });

        createClickEvents(this.viewport, player as Player);
    }

    newStructure(packet: Schemas.newStructure) {
        const id = packet[0];
        const pos = new PIXI.Point(packet[1], packet[2]);
        scaleCoords(pos);
        const structure = new Structure(
            itemMap.getv(packet[4]) || "stone",
            pos,
            packet[3],
            packet[5]
        );
        this.objects.set(id, structure);
        this.viewport.addChild(structure);
    }

    newEntity(packet: Schemas.newEntity) {
        const id = packet[0];
        const pos = new PIXI.Point(packet[1], packet[2]);
        scaleCoords(pos);
        const entity = new Entity(
            this.animationManager,
            itemMap.getv(packet[4]) || "stone",
            pos,
            packet[3],
            2
        );
        entity.setState([Date.now(), pos.x, pos.y]);
        this.objects.set(id, entity);
        this.viewport.addChild(entity);
    }

    newPlayer(packet: Schemas.newPlayer) {
        const id = packet[0];
        const pos = new PIXI.Point(packet[1], packet[2]);
        scaleCoords(pos);
        const player = new Player(
            this.animationManager,
            packet[4],
            pos,
            packet[3]
        );
        player.rotationSpeed = 100;
        this.objects.set(id, player);
        this.dynamicObjs.set(id, player);
        this.viewport.addChild(player);
    }

    moveObject(packet: Schemas.moveObject) {
        const id = packet[0];
        const time = packet[1];

        const object = this.objects.get(id);
        if (object) {
            object.setState([
                Date.now() + time,
                packet[2] * 10,
                packet[3] * 10,
            ]);
            this.updatingObjs.set(id, object);
        }
    }

    rotateObject(packet: Schemas.rotateObject) {
        const id = packet[0];

        const object = this.objects.get(id);
        if (object && id !== this.user) {
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
