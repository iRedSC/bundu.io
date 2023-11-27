import * as PIXI from "pixi.js";
import { clamp, degrees, lerp, rotationLerp } from "../../lib/transforms";
import { Keyframes, AnimationManager } from "../../lib/animation";
import { block } from "../main";

//* New: [pos, rotation, name, selectedItem, helmet]
//* Changed: [[1, pos, rotation], [2, selectedItem, helmet]]

function checkData(data: any[]): data is [[number, number], number] {
    try {
        const pos = data[0];
        const rotation = data[1];
        if (
            typeof pos[0] === "number" &&
            typeof pos[1] === "number" &&
            typeof rotation === "number"
        ) {
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

interface State {
    time: number;
    pos: PIXI.Point;
    rotation: number;
}

interface PlayerParts {
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
}

export class Player {
    id: number;
    parts: PlayerParts;
    time: number;
    states: State[];
    pos: PIXI.Point;
    rotation: number;
    animationManager: AnimationManager<PlayerParts>;
    constructor(time: number, id: number, data: unknown[]) {
        this.parts = {
            container: new PIXI.Container(),
            body: {
                container: new PIXI.Container(),
                sprite: PIXI.Sprite.from("./assets/player.svg", {
                    mipmap: PIXI.MIPMAP_MODES.ON,
                }),
                helmet: PIXI.Sprite.from("./assets/amethyst_helmet.svg", {
                    mipmap: PIXI.MIPMAP_MODES.ON,
                }),
            },
            leftHand: {
                container: new PIXI.Container(),
                sprite: PIXI.Sprite.from("./assets/hand.svg", {
                    mipmap: PIXI.MIPMAP_MODES.ON,
                }),
                selectedItem: PIXI.Sprite.from("./assets/amethyst_sword.svg", {
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

        this.time = time;

        this.id = id;

        if (checkData(data)) {
            this.pos = new PIXI.Point(data[0][0], data[0][1]);
            this.rotation = data[1];
        } else {
            this.pos = new PIXI.Point(0, 0);
            this.rotation = 0;
        }

        const parts = this.parts;
        const container = parts.container;
        const body = parts.body;
        const leftHand = parts.leftHand;
        const rightHand = parts.rightHand;

        container.pivot.x = container.width / 2;
        container.pivot.y = container.height / 2;

        container.addChild(body.container);

        body.container.addChild(leftHand.container);
        body.container.addChild(rightHand.container);
        body.container.addChild(body.sprite);

        leftHand.container.addChild(leftHand.sprite);

        rightHand.container.addChild(rightHand.sprite);

        body.container.addChild(body.helmet);
        leftHand.container.addChild(leftHand.selectedItem);

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
        leftHand.selectedItem.rotation = degrees(-135);
        leftHand.selectedItem.x = 0;
        leftHand.selectedItem.y = -120;

        rightHand.container.x = 60;
        rightHand.container.y = 45;
        rightHand.container.pivot.set(-300, 0);
        rightHand.sprite.anchor.set(0.5);
        rightHand.container.scale.set(0.5);
        rightHand.sprite.scale.set(0.5);

        this.animationManager = loadAnimations(this.parts);
        this.trigger("leftHand");
        this.trigger("rightHand");

        this.states = [];

        this.states.push({
            time: this.time,
            pos: this.pos,
            rotation: this.rotation,
        });
    }
    get container() {
        return this.parts.container;
    }

    trigger(name: string) {
        this.animationManager.start(name);
    }

    setState(time: number) {
        while (time > this.states[0].time && this.states.length > 2) {
            this.states.splice(0, 1);
        }
        const lastState = this.states[0];
        const nextState = this.states[1] || this.states[0];
        const difference =
            (time - lastState.time) / (nextState.time - lastState.time);
        const t = clamp(difference, 0, 1);
        this.parts.container.x = lerp(lastState.pos.x, nextState.pos.x, t);
        this.parts.container.y = lerp(lastState.pos.y, nextState.pos.y, t);

        this.parts.container.rotation = rotationLerp(
            lastState.rotation,
            nextState.rotation,
            t
        );
    }

    update(time: number, data: unknown[]) {
        let pos;
        let rotation;
        if (!checkData(data)) {
            return;
        } else {
            (pos = data[0]), (rotation = data[1]);
        }
        // let selectedItem;
        // let helmet;

        // for (let property of data) {
        //     try {
        //         if (!checkPosRot(property) && !checkSelectedItems(property)) {
        //             continue;
        //         }
        //         if (property[0] === 1) {
        //             pos = property[1];
        //             rotation = property[2];
        //             continue;
        //         }
        //         if (property[0] === 2) {
        //             selectedItem = property[1];
        //             helmet = property[2];
        //             continue;
        //         }
        //     } catch (error) {
        //         console.log(error);
        //     }
        // }

        this.states.push({
            time: this.time,
            pos: structuredClone(this.pos),
            rotation: this.rotation,
        });
        this.time = time;
        if (pos) {
            this.pos = new PIXI.Point(pos[0], pos[1]);
        }
        if (rotation) {
            this.rotation = rotation;
        }
        this.states.push({
            time: this.time,
            pos: structuredClone(this.pos),
            rotation: this.rotation,
        });
    }
}

function checkPosRot(data: any): data is [1, [number, number], number] {
    try {
        const pos = data[1];
        const rotation = data[2];
        if (
            data[0] === 1 &&
            typeof pos[0] === "number" &&
            typeof pos[1] === "number" &&
            typeof rotation === "number"
        ) {
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

function checkSelectedItems(data: any): data is [2, string, string] {
    try {
        const selectedItem = data[1];
        const helmet = data[2];
        if (
            data[0] === 2 &&
            typeof selectedItem === "string" &&
            typeof helmet === "string"
        ) {
            return true;
        }
        return false;
    } catch {
        return false;
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
        animation.next(75);
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
        leftHand.rotation = lerp(degrees(0), degrees(-90), animation.t);
        if (!block) {
            animation.next(60);
        }
    });
    blockKeyframes.set(2, ({ target, animation }) => {
        const leftHand = target.leftHand.container;
        leftHand.rotation = lerp(degrees(-90), degrees(0), animation.t);
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
