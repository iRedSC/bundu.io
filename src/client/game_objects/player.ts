import * as PIXI from "pixi.js";
import { degrees, lerp, rotationLerp } from "../../lib/transforms";
import { Keyframes, AnimationManager } from "../../lib/animation";
import { block } from "../events";
import { round } from "../../lib/math";
import { NIGHT_COLOR } from "../constants";

import itemTypes from "../configs/item_types.json";
import items from "../configs/items.json";

type itemTypes = {
    [key: string]: keyof typeof itemTypes;
};

type items = {
    [key: string]: string;
};

//* New: [pos, rotation, name, selectedItem, helmet]
//* Changed: [[1, pos, rotation], [2, selectedItem, helmet]]

function validItemType(type: string): keyof typeof itemTypes {
    const validate = (type: string): type is keyof typeof itemTypes =>
        type in itemTypes;
    if (validate(type)) {
        return type;
    }
    return "undefined";
}

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

type Gear = [
    selectedItem: keyof typeof items,
    helmet: keyof typeof items,
    backpack: number
];
function typeofGear(gear?: Gear): gear is Gear {
    if (!gear) {
        return false;
    }
    return gear[0] in items && gear[1] in items && typeof gear[2] === "number";
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
    selectedItem: keyof typeof items;
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

        this.selectedItem = "empty";
        this.helmet = "empty";
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
        // console.log(this.lastState[1], this.pos.x, this.nextState[1]);

        // this.rotation = this.nextState[3];
        // this.pos.x = this.nextState[1];
        // this.pos.y = this.nextState[2];

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

        if (this.selectedItem !== "empty") {
            this.parts.leftHand.selectedItem.renderable = true;
            const item = items[this.selectedItem];
            const itemData = itemTypes[validItemType(item.item_type)];
            const texture = PIXI.Texture.from(`./assets/${item.sprite}.svg`);
            this.parts.leftHand.selectedItem.scale.set(
                itemData.hand_position.scale
            );
            this.parts.leftHand.selectedItem.texture = texture;
            this.parts.leftHand.selectedItem.x = itemData.hand_position.x;
            this.parts.leftHand.selectedItem.y = itemData.hand_position.y;
            this.parts.leftHand.selectedItem.rotation = degrees(
                itemData.hand_position.rotation
            );
        }
    }

    setNight() {
        this.parts.body.helmet.tint = NIGHT_COLOR;
        this.parts.body.sprite.tint = NIGHT_COLOR;
        this.parts.leftHand.selectedItem.tint = NIGHT_COLOR;
        this.parts.leftHand.sprite.tint = NIGHT_COLOR;
        this.parts.rightHand.sprite.tint = NIGHT_COLOR;
    }

    setDay() {
        this.parts.body.helmet.tint = 0xffffff;
        this.parts.body.sprite.tint = 0xffffff;
        this.parts.leftHand.selectedItem.tint = 0xffffff;
        this.parts.leftHand.sprite.tint = 0xffffff;
        this.parts.rightHand.sprite.tint = 0xffffff;
    }
}

function loadAnimations(target: PlayerParts) {
    let leftHandKeyframes: Keyframes<PlayerParts> = new Map();
    leftHandKeyframes.set(0, ({ target, animation }) => {
        const leftHand = target.leftHand.container;
        if (animation.firstKeyframe) {
            animation.meta.x = leftHand.x;
            animation.goto(0, 2000);
        }

        leftHand.x = animation.meta.x + Math.cos(animation.t * Math.PI * 2) * 5;
        if (animation.keyframeEnded) {
            animation.goto(0, 2000);
        }
    });

    let rightHandKeyframes: Keyframes<PlayerParts> = new Map();
    rightHandKeyframes.set(0, ({ target, animation }) => {
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
    });

    const attackKeyframes: Keyframes<PlayerParts> = new Map();
    attackKeyframes.set(0, ({ target, animation }) => {
        const leftHand = target.leftHand.container;
        if (leftHand.rotation !== 0) {
            animation.expired = true;
        }
        animation.next(100);
    });
    attackKeyframes.set(1, ({ target, animation }) => {
        const leftHand = target.leftHand.container;
        const rightHand = target.rightHand.container;
        leftHand.rotation = lerp(degrees(0), degrees(-90), animation.t);
        rightHand.rotation = lerp(degrees(0), degrees(-15), animation.t);
        if (animation.keyframeEnded) {
            animation.next(200);
        }
    });
    attackKeyframes.set(2, ({ target, animation }) => {
        const leftHand = target.leftHand.container;
        const rightHand = target.rightHand.container;
        leftHand.rotation = lerp(degrees(-90), degrees(0), animation.t);
        rightHand.rotation = lerp(degrees(-15), degrees(0), animation.t);
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    });

    const blockKeyframes: Keyframes<PlayerParts> = new Map();
    blockKeyframes.set(0, ({ target, animation }) => {
        const leftHand = target.leftHand.container;
        if (leftHand.rotation !== 0) {
            animation.expired = true;
        }
        animation.next(75);
    });
    blockKeyframes.set(1, ({ target, animation }) => {
        const leftHand = target.leftHand.container;
        const rightHand = target.rightHand.container;
        leftHand.rotation = lerp(degrees(0), degrees(-90), animation.t);
        rightHand.rotation = lerp(degrees(0), degrees(25), animation.t);
        if (!block) {
            animation.next(60);
        }
    });
    blockKeyframes.set(2, ({ target, animation }) => {
        const leftHand = target.leftHand.container;
        const rightHand = target.rightHand.container;
        leftHand.rotation = lerp(degrees(-90), degrees(0), animation.t);
        rightHand.rotation = lerp(degrees(25), degrees(0), animation.t);
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    });
    const animationManager = new AnimationManager(target);
    animationManager.add("leftHand", leftHandKeyframes);
    animationManager.add("rightHand", rightHandKeyframes);
    animationManager.add("attack", attackKeyframes);
    animationManager.add("block", blockKeyframes);

    return animationManager;
}
