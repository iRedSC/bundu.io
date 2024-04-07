import { Button } from "@pixi/ui";
import * as PIXI from "pixi.js";
import { SpriteFactory } from "../assets/sprite_factory";
import { idMap } from "../configs/id_map";

export class ItemButton {
    button: Button;
    background: PIXI.Sprite;
    item: number;
    itemSprite: PIXI.Sprite;
    hovering: boolean;
    callback?: (item: number) => void;

    constructor(callback?: (item: number) => void) {
        const container = new PIXI.Container();
        container.sortableChildren = true;

        this.button = new Button(container);
        this.hovering = false;

        this.callback = callback;
        // this.background = new PIXI.Graphics();
        this.background = SpriteFactory.build("item_button");

        this.item = -1;
        this.itemSprite = SpriteFactory.build(this.item);

        this.button.view.addChild(this.background);

        this.button.hover = () => {
            this.button.view.scale.set(1.1);
            this.update(0x999999);
            this.hovering = true;
        };

        this.button.out = () => {
            this.button.view.scale.set(1);
            this.update(0x777777);
            this.hovering = false;
        };

        this.button.down = () => {
            this.button.view.scale.set(0.9);
            this.update(0x777777);
        };

        this.button.up = () => {
            this.button.view.scale.set(1);

            if (this.hovering) {
                this.button.hover();
            } else {
                this.update(0x777777);
            }
        };

        this.button.press = () => {
            console.log(this.callback);
            if (this.callback) {
                this.callback(this.item);
            }
        };
    }

    setItem(item: number) {
        const name = idMap.getv(item);
        if (!name) {
            return;
        }
        if (this.itemSprite) {
            this.button.view.removeChild(this.itemSprite);
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
        this.button.view.addChild(this.itemSprite);
    }

    update(tint: number) {
        this.background.width = 68;
        this.background.height = 68;
        this.background.tint = tint;
        this.itemSprite.position.set(
            this.background.width / 2,
            this.background.height / 2
        );
        this.button.view.pivot.set(
            this.button.view.width / 4,
            this.button.view.height / 4
        );
    }
    get position() {
        return this.button.view.position;
    }

    setCallback(callback: (item: number) => void) {
        this.callback = callback;
    }
}
