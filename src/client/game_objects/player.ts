import * as PIXI from "pixi.js";
import { degrees, lerp } from "../../lib/transforms";
import { Keyframes, AnimationManager, AnimationMap } from "../../lib/animation";
import { getItem } from "../configs/configs";
import { WorldObject } from "./world_object";

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

export class Player extends WorldObject {
    sprite: PlayerParts;
    name: string;

    animations: AnimationMap<Player>;

    selectedItem: string;
    helmet: string;
    backpack: number;

    blocking: boolean;
    constructor(
        manager: AnimationManager,
        name: string,
        pos: PIXI.Point,
        rotation: number
    ) {
        super(pos, rotation);
        this.sprite = {
            body: {
                container: new PIXI.Container(),
                sprite: PIXI.Sprite.from("./assets/player.svg", {
                    mipmap: PIXI.MIPMAP_MODES.ON,
                }),
                helmet: PIXI.Sprite.from("./", {
                    mipmap: PIXI.MIPMAP_MODES.ON,
                }),
            },
            leftHand: {
                container: new PIXI.Container(),
                sprite: PIXI.Sprite.from("./assets/hand.svg", {
                    mipmap: PIXI.MIPMAP_MODES.ON,
                }),
                selectedItem: PIXI.Sprite.from("./", {
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

        this.name = name;

        this.selectedItem = "";
        this.helmet = "";
        this.backpack = -1;

        this.blocking = false;

        const parts = this.sprite;
        const container = this;
        const body = parts.body;
        const leftHand = parts.leftHand;
        const rightHand = parts.rightHand;
        container.zIndex = 1;

        leftHand.selectedItem.renderable = false;

        container.pivot.x = container.width / 2;
        container.pivot.y = container.height / 2 + 15;

        container.addChild(body.container);

        body.container.addChild(leftHand.container);
        body.container.addChild(rightHand.container);
        body.container.addChild(body.sprite);

        leftHand.container.addChild(leftHand.selectedItem);
        leftHand.container.addChild(leftHand.sprite);

        rightHand.container.addChild(rightHand.sprite);

        body.container.addChild(body.helmet);

        body.sprite.anchor.set(0.5);
        body.sprite.scale.set(0.9);
        body.helmet.anchor.set(0.5);

        leftHand.container.x = -70;
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

        rightHand.container.x = 70;
        rightHand.container.y = 45;
        rightHand.container.pivot.set(-300, 0);
        rightHand.sprite.anchor.set(0.5);
        rightHand.container.scale.set(0.5);
        rightHand.sprite.scale.set(0.5);

        this.animations = loadAnimations(this);
        this.trigger("leftHand", manager);
        this.trigger("rightHand", manager);
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

    trigger(name: string, manager: AnimationManager) {
        const animation = this.animations.get(name);
        if (animation) {
            manager.add(this, animation.run());
        }
    }

    setGear(gear?: Gear) {
        if (typeofGear(gear)) {
            this.selectedItem = gear[0];
            this.helmet = gear[1];
            this.backpack = gear[2];
            this.updateGear();
        }
    }

    updateGear() {
        this.sprite.leftHand.selectedItem.renderable = false;
        this.sprite.body.helmet.renderable = false;

        if (this.selectedItem !== "") {
            this.sprite.leftHand.selectedItem.renderable = true;
            const item = getItem(this.selectedItem, ["hand_display", "sprite"]);
            if (!item) {
                return;
            }
            const texture = PIXI.Texture.from(`./assets/${item.sprite}.svg`);
            this.sprite.leftHand.selectedItem.scale.set(
                item.hand_display!.scale
            );
            this.sprite.leftHand.selectedItem.texture = texture;
            this.sprite.leftHand.selectedItem.x = item.hand_display!.x;
            this.sprite.leftHand.selectedItem.y = item.hand_display!.y;
            this.sprite.leftHand.selectedItem.rotation = degrees(
                item.hand_display!.rotation
            );
        }

        if (this.helmet !== "") {
            this.sprite.body.helmet.renderable = true;
            const item = getItem(this.helmet, ["body_display", "sprite"]);
            if (!item) {
                return;
            }
            const texture = PIXI.Texture.from(`./assets/${item.sprite}.svg`);
            this.sprite.body.helmet.scale.set(item.body_display!.scale);
            this.sprite.body.helmet.texture = texture;
            this.sprite.body.helmet.x = item.body_display!.x;
            this.sprite.body.helmet.y = item.body_display!.y;
            this.sprite.body.helmet.rotation = degrees(
                item.body_display!.rotation
            );
        }
    }
}

function loadAnimations(target: Player) {
    let leftHandKeyframes: Keyframes<Player> = new Keyframes();
    leftHandKeyframes.frame(0).set = ({ target, animation }) => {
        const leftHand = target.sprite.leftHand.container;
        if (animation.firstKeyframe) {
            animation.meta.x = leftHand.x;
            animation.goto(0, 2000);
        }

        leftHand.x = animation.meta.x + Math.cos(animation.t * Math.PI * 2) * 5;
        if (animation.keyframeEnded) {
            animation.goto(0, 2000);
        }
    };

    let rightHandKeyframes: Keyframes<Player> = new Keyframes();
    rightHandKeyframes.frame(0).set = ({ target, animation }) => {
        const rightHand = target.sprite.rightHand.container;
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

    const attackKeyframes: Keyframes<Player> = new Keyframes();
    attackKeyframes.frame(0).set = ({ target, animation }) => {
        const leftHand = target.sprite.leftHand.container;
        if (leftHand.rotation !== 0) {
            animation.expired = true;
        }
        animation.next(100);
    };
    attackKeyframes.frame(1).set = ({ target, animation }) => {
        const leftHand = target.sprite.leftHand.container;
        const rightHand = target.sprite.rightHand.container;
        leftHand.rotation = lerp(degrees(0), degrees(-90), animation.t);
        rightHand.rotation = lerp(degrees(0), degrees(-15), animation.t);
        if (animation.keyframeEnded) {
            animation.next(200);
        }
    };
    attackKeyframes.frame(2).set = ({ target, animation }) => {
        const leftHand = target.sprite.leftHand.container;
        const rightHand = target.sprite.rightHand.container;
        leftHand.rotation = lerp(degrees(-90), degrees(0), animation.t);
        rightHand.rotation = lerp(degrees(-15), degrees(0), animation.t);
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };

    const blockKeyframes: Keyframes<Player> = new Keyframes();
    blockKeyframes.frame(0).set = ({ target, animation }) => {
        const leftHand = target.sprite.leftHand.container;
        if (leftHand.rotation !== 0) {
            animation.expired = true;
        }
        animation.next(75);
    };
    blockKeyframes.frame(1).set = ({ target, animation }) => {
        const leftHand = target.sprite.leftHand.container;
        const rightHand = target.sprite.rightHand.container;
        leftHand.rotation = lerp(degrees(0), degrees(-90), animation.t);
        rightHand.rotation = lerp(degrees(0), degrees(25), animation.t);
        if (!target.blocking) {
            animation.next(60);
        }
    };
    blockKeyframes.frame(2).set = ({ target, animation }) => {
        const leftHand = target.sprite.leftHand.container;
        const rightHand = target.sprite.rightHand.container;
        leftHand.rotation = lerp(degrees(-90), degrees(0), animation.t);
        rightHand.rotation = lerp(degrees(25), degrees(0), animation.t);
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };
    const animations: AnimationMap<Player> = new AnimationMap(target);
    animations.set("leftHand", leftHandKeyframes);
    animations.set("rightHand", rightHandKeyframes);
    animations.set("attack", attackKeyframes);
    animations.set("block", blockKeyframes);

    return animations;
}
