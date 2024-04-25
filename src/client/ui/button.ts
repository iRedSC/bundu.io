// import { Button } from "@pixi/ui";
import * as PIXI from "pixi.js";
import { SpriteFactory, SpriteWrapper } from "../assets/sprite_factory";
import { idMap } from "../configs/id_map";

export class ItemButton {
    button: PIXI.Container;
    background: SpriteWrapper;
    disableSprite: SpriteWrapper;
    item: number;
    itemSprite: SpriteWrapper;
    hovering: boolean;
    rightclick?: (item: number, shift?: boolean) => void;
    leftclick?: (item: number, shift?: boolean) => void;

    constructor() {
        this.button = new PIXI.Container();
        this.button.sortableChildren = true;
        this.button.eventMode = "static";

        this.hovering = false;

        // this.background = new PIXI.Graphics();
        this.background = SpriteFactory.build("item_button");
        this.disableSprite = SpriteFactory.build("item_button");

        this.disableSprite.width = 68;
        this.disableSprite.height = 68;
        this.disableSprite.tint = 0x000000;
        this.disableSprite.alpha = 0.5;
        this.disableSprite.zIndex = 1000;
        this.disableSprite.visible = false;

        this.item = -1;
        this.itemSprite = SpriteFactory.build(this.item);

        this.button.addChild(this.background);
        this.button.addChild(this.disableSprite);

        this.button.onmouseover = () => {
            this.button.scale.set(1.1);
            this.update(0x999999);
            this.hovering = true;
        };

        this.button.onmouseleave = () => {
            this.button.scale.set(1);
            this.update(0x777777);
            this.hovering = false;
        };

        this.button.onpointerdown = () => {
            this.button.scale.set(0.9);
            this.update(0x777777);
        };
        this.button.onpointerup = (ev) => {
            console.log(ev?.button);
            if (ev?.button === 2) {
                if (this.rightclick) {
                    this.rightclick(this.item, ev?.shiftKey);
                }
            } else if (ev?.button === 0) {
                if (this.leftclick) {
                    this.leftclick(this.item, ev?.shiftKey);
                }
            }
            this.button.scale.set(1);

            if (this.hovering) {
                this.button.emit("hover");
            } else {
                this.update(0x777777);
            }
        };
    }

    disable() {
        this.disableSprite.visible = true;
        this.button.eventMode = "none";
    }

    enable() {
        this.disableSprite.visible = false;
        this.button.eventMode = "static";
    }

    setItem(item: number) {
        const name = idMap.getv(item);
        if (!name) {
            return;
        }
        if (this.itemSprite) {
            this.button.removeChild(this.itemSprite);
        }
        this.item = item;
        this.itemSprite = SpriteFactory.update(
            this.itemSprite,
            undefined,
            name
        );
        this.itemSprite.width = 65;
        this.itemSprite.height = 65;
        this.itemSprite.zIndex = 1;
        this.itemSprite.anchor.set(0.5);
        this.itemSprite.position.set(
            this.background.width / 2,
            this.background.height / 2
        );
        this.button.addChild(this.itemSprite);
        this.button.sortChildren();
    }

    update(tint: number) {
        this.background.width = 68;
        this.background.height = 68;
        this.background.tint = tint;
        this.itemSprite.position.set(
            this.background.width / 2,
            this.background.height / 2
        );
        this.button.pivot.set(this.button.width / 4, this.button.height / 4);
    }
    get position() {
        return this.button.position;
    }
}
