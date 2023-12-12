import { Button } from "@pixi/ui";
import * as PIXI from "pixi.js";

export class ItemButton extends Button {
    background: PIXI.Graphics;
    item: { imagePath: string; result: string };
    itemSprite: PIXI.Sprite;
    hovering: boolean;

    constructor() {
        const container = new PIXI.Container();
        container.sortableChildren = true

        super(container);


        this.hovering = false;

        this.background = new PIXI.Graphics();
        this.view.pivot.set(this.view.width / 4, this.view.height / 4);

        this.item = { imagePath: "", result: "empty" };
        this.itemSprite = PIXI.Sprite.from("./", {
            mipmap: PIXI.MIPMAP_MODES.ON,
        });

        this.view.addChild(this.background);
        this.update(0x777777, 0x444444);
    }

    setItem(item: { imagePath: string; result: string }) {
        if (this.itemSprite) {
            this.view.removeChild(this.itemSprite);
        }
        this.item = item;
        this.itemSprite = PIXI.Sprite.from(item.imagePath, {
            mipmap: PIXI.MIPMAP_MODES.ON,
        });
        this.itemSprite.width = 45;
        this.itemSprite.height = 45;
        this.itemSprite.zIndex = 1;
        this.itemSprite.anchor.set(0.5);
        this.itemSprite.position.set(
            this.background.width / 2,
            this.background.height / 2
        );
        this.view.addChild(this.itemSprite);
    }

    update(fillColor: number, borderColor: number) {
        this.background.clear();
        this.background.lineStyle(2, borderColor, 1);
        this.background.beginFill(fillColor, 0.7);
        this.background.drawRoundedRect(0, 0, 60, 60, 10);
        this.background.endFill();
        this.view.pivot.set(this.view.width / 4, this.view.height / 4);
    }

    override hover() {
        this.view.scale.set(1.1);
        this.update(0x999999, 0x666666);
        this.hovering = true;
    }

    override out() {
        this.view.scale.set(1);
        this.update(0x777777, 0x444444);
        this.hovering = false;
    }

    override down() {
        this.view.scale.set(0.9);
        this.update(0x777777, 0x444444);
    }

    override up() {
        this.view.scale.set(1);

        if (this.hovering) {
            this.hover();
        } else {
            this.update(0x777777, 0x444444);
        }
    }

    override press() {
        console.log(this.item.result);
    }
}
