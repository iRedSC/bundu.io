import * as PIXI from "pixi.js";
import { degrees, lerp, rotationLerp } from "../../lib/transforms";
import { Keyframes, AnimationManager } from "../../lib/animation";
import { block } from "../events";
import { round } from "../../lib/math";

import { getItem } from "../configs/configs";

//* New: [pos, rotation, name, selectedItem, helmet]
//* Changed: [[1, pos, rotation], [2, selectedItem, helmet]]

type State = [time: number, x: number, y: number, rotation: number];
function typeofState(state?: State): state is State {
    if (!state) {
        return false;
    }
    return (
        typeof state[0] === "number" &&
        typeof state[1] === "number" &&
        typeof state[2] === "number" &&
        typeof state[3] === "number"
    );
}

type Gear = [selectedItem: string, helmet: string, backpack: number];
function typeofGear(gear?: Gear): gear is Gear {
    if (!gear) {
        return false;
    }
    return (
        typeof gear[0] === "string" &&
        typeof gear[1] === "string" &&
        typeof gear[2] === "number"
    );
}

type PlayerParts = {
    container: PIXI.Container;
    body: {
        container: PIXI.Container;
        sprite: PIXI.Sprite;
        helmet: PIXI.Sprite;
    };
    leftHand: {
        container: PIXI.Container;
        sprite: PIXI.Sprite;
        selectedItem: PIXI.Sprite;
    };
    rightHand: {
        container: PIXI.Container;
        sprite: PIXI.Sprite;
    };
};

export class Player {
    id: number;
    parts: PlayerParts;
    lastState: State;
    nextState: State;
    pos: PIXI.Point;
    rotation: number;
    animationManager: AnimationManager<PlayerParts>;
    selectedItem: string;
    helmet: string;
    backpack: number;
    constructor(id: number, state: State) {
        this.parts = {
            container: new PIXI.Container(),
            body: {
                container: new PIXI.Container(),
                sprite: PIXI.Sprite.from("./assets/player.svg", {
                    mipmap: PIXI.MIPMAP_MODES.ON,
                }),
                helmet: PIXI.Sprite.from("./assets/diamond_helmet.svg", {
                    mipmap: PIXI.MIPMAP_MODES.ON,
                }),
            },
            leftHand: {
                container: new PIXI.Container(),
                sprite: PIXI.Sprite.from("./assets/hand.svg", {
                    mipmap: PIXI.MIPMAP_MODES.ON,
                }),
                selectedItem: PIXI.Sprite.from("./assets/diamond_pickaxe.svg", {
                    mipmap: PIXI.MIPMAP_MODES.ON,
                }),
            },
            rightHand: {
                container: new PIXI.Container(),
                sprite: PIXI.Sprite.from("./assets/hand.svg", {
                    mipmap: PIXI.MIPMAP_MODES.ON,
                }),
            },
        };

        this.id = id;

        this.selectedItem = "";
        this.helmet = "";
        this.backpack = -1;

        this.pos = new PIXI.Point(0, 0);
        this.rotation = 0;

        const parts = this.parts;
        const container = parts.container;
        const body = parts.body;
        const leftHand = parts.leftHand;
        const rightHand = parts.rightHand;
        container.zIndex = 1;

        leftHand.selectedItem.renderable = false;

        container.pivot.x = container.width / 2;
        container.pivot.y = container.height / 2;

        container.addChild(body.container);

        body.container.addChild(leftHand.container);
        body.container.addChild(rightHand.container);
        body.container.addChild(body.sprite);

        leftHand.container.addChild(leftHand.selectedItem);
        leftHand.container.addChild(leftHand.sprite);

        rightHand.container.addChild(rightHand.sprite);

        body.container.addChild(body.helmet);

        body.sprite.anchor.set(0.5);
        body.helmet.anchor.set(0.5);

        leftHand.container.x = -60;
        leftHand.container.y = 45;
        leftHand.sprite.anchor.set(0.5);
        leftHand.container.pivot.set(300, 0);
        leftHand.container.scale.set(0.5);
        leftHand.sprite.scale.set(0.5);

        leftHand.selectedItem.anchor.set(1);
        leftHand.selectedItem.scale.set(1.8);
        leftHand.selectedItem.rotation = degrees(-100);
        leftHand.selectedItem.x = 100;
        leftHand.selectedItem.y = -200;

        rightHand.container.x = 60;
        rightHand.container.y = 45;
        rightHand.container.pivot.set(-300, 0);
        rightHand.sprite.anchor.set(0.5);
        rightHand.container.scale.set(0.5);
        rightHand.sprite.scale.set(0.5);

        this.animationManager = loadAnimations(this.parts);
        this.trigger("leftHand");
        this.trigger("rightHand");

        this.lastState = state;
        this.nextState = state;
    }

    selectItem({ hand, body }: { hand?: string; body?: string }) {
        if (hand) {
            this.selectedItem = hand;
        }
        if (body) {
            this.helmet = body;
        }
        this.updateGear();
    }

    get container() {
        return this.parts.container;
    }

    trigger(name: string) {
        this.animationManager.start(name);
    }

    move() {
        const now = Date.now();
        const t =
            (now - this.lastState[0]) / (this.nextState[0] - this.lastState[0]);
        this.pos.x = round(lerp(this.lastState[1], this.nextState[1], t));
        this.pos.y = round(lerp(this.lastState[2], this.nextState[2], t));
        this.rotation = rotationLerp(this.lastState[3], this.nextState[3], t);

        this.container.position = this.pos;
        this.container.rotation = this.rotation;
    }

    update(state?: State, gear?: Gear) {
        if (typeofState(state)) {
            this.lastState = this.nextState;

            this.nextState = state;
            if (this.nextState[0] < this.lastState[0]) {
                this.nextState[0] = this.lastState[0];
            }
        }
        if (typeofGear(gear)) {
            this.selectedItem = gear[0];
            this.helmet = gear[1];
            this.backpack = gear[2];
            this.updateGear();
        }
    }

    updateGear() {
        this.parts.leftHand.selectedItem.renderable = false;
        this.parts.body.helmet.renderable = false;

        if (this.selectedItem !== "") {
            this.parts.leftHand.selectedItem.renderable = true;
            const item = getItem(this.selectedItem, ["hand_display", "sprite"]);
            if (!item) {
                return;
            }
            const texture = PIXI.Texture.from(`./assets/${item.sprite}.svg`);
            this.parts.leftHand.selectedItem.scale.set(
                item.hand_display!.scale
            );
            this.parts.leftHand.selectedItem.texture = texture;
            this.parts.leftHand.selectedItem.x = item.hand_display!.x;
            this.parts.leftHand.selectedItem.y = item.hand_display!.y;
            this.parts.leftHand.selectedItem.rotation = degrees(
                item.hand_display!.rotation
            );
        }

        if (this.helmet !== "") {
            this.parts.body.helmet.renderable = true;
            const item = getItem(this.helmet, ["body_display", "sprite"]);
            if (!item) {
                return;
            }
            const texture = PIXI.Texture.from(`./assets/${item.sprite}.svg`);
            this.parts.body.helmet.scale.set(item.body_display!.scale);
            this.parts.body.helmet.texture = texture;
            this.parts.body.helmet.x = item.body_display!.x;
            this.parts.body.helmet.y = item.body_display!.y;
            this.parts.body.helmet.rotation = degrees(
                item.body_display!.rotation
            );
        }
    }
}

function loadAnimations(target: PlayerParts) {
    let leftHandKeyframes: Keyframes<PlayerParts> = new Keyframes();
    leftHandKeyframes.frame(0).set = ({ target, animation }) => {
        const leftHand = target.leftHand.container;
        if (animation.firstKeyframe) {
            animation.meta.x = leftHand.x;
            animation.goto(0, 2000);
        }

        leftHand.x = animation.meta.x + Math.cos(animation.t * Math.PI * 2) * 5;
        if (animation.keyframeEnded) {
            animation.goto(0, 2000);
        }
    };

    let rightHandKeyframes: Keyframes<PlayerParts> = new Keyframes();
    rightHandKeyframes.frame(0).set = ({ target, animation }) => {
        const rightHand = target.rightHand.container;
        if (animation.firstKeyframe) {
            animation.meta.x = rightHand.x;
            animation.goto(0, 2000);
        }

        rightHand.x =
            animation.meta.x - Math.cos(animation.t * Math.PI * 2) * 5;
        if (animation.keyframeEnded) {
            animation.goto(0, 2000);
        }
    };

    const attackKeyframes: Keyframes<PlayerParts> = new Keyframes();
    attackKeyframes.frame(0).set = ({ target, animation }) => {
        const leftHand = target.leftHand.container;
        if (leftHand.rotation !== 0) {
            animation.expired = true;
        }
        animation.next(100);
    };
    attackKeyframes.frame(1).set = ({ target, animation }) => {
        const leftHand = target.leftHand.container;
        const rightHand = target.rightHand.container;
        leftHand.rotation = lerp(degrees(0), degrees(-90), animation.t);
        rightHand.rotation = lerp(degrees(0), degrees(-15), animation.t);
        if (animation.keyframeEnded) {
            animation.next(200);
        }
    };
    attackKeyframes.frame(2).set = ({ target, animation }) => {
        const leftHand = target.leftHand.container;
        const rightHand = target.rightHand.container;
        leftHand.rotation = lerp(degrees(-90), degrees(0), animation.t);
        rightHand.rotation = lerp(degrees(-15), degrees(0), animation.t);
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };

    const blockKeyframes: Keyframes<PlayerParts> = new Keyframes();
    blockKeyframes.frame(0).set = ({ target, animation }) => {
        const leftHand = target.leftHand.container;
        if (leftHand.rotation !== 0) {
            animation.expired = true;
        }
        animation.next(75);
    };
    blockKeyframes.frame(1).set = ({ target, animation }) => {
        const leftHand = target.leftHand.container;
        const rightHand = target.rightHand.container;
        leftHand.rotation = lerp(degrees(0), degrees(-90), animation.t);
        rightHand.rotation = lerp(degrees(0), degrees(25), animation.t);
        if (!block) {
            animation.next(60);
        }
    };
    blockKeyframes.frame(2).set = ({ target, animation }) => {
        const leftHand = target.leftHand.container;
        const rightHand = target.rightHand.container;
        leftHand.rotation = lerp(degrees(-90), degrees(0), animation.t);
        rightHand.rotation = lerp(degrees(25), degrees(0), animation.t);
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };
    const animationManager = new AnimationManager(target);
    animationManager.add("leftHand", leftHandKeyframes);
    animationManager.add("rightHand", rightHandKeyframes);
    animationManager.add("attack", attackKeyframes);
    animationManager.add("block", blockKeyframes);

    return animationManager;
}
