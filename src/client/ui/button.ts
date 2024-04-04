import { Button } from "@pixi/ui";
import * as PIXI from "pixi.js";
import { SpriteFactory } from "../assets/sprite_factory";

export class ItemButton extends Button {
    background: PIXI.Graphics;
    item: string;
    itemSprite: PIXI.Sprite;
    hovering: boolean;
    callback?: (item: string) => void;

    constructor(callback?: (item: string) => void) {
        const container = new PIXI.Container();
        container.sortableChildren = true;

        super(container);

        this.hovering = false;

        this.callback = callback;
        this.background = new PIXI.Graphics();
        this.view.pivot.set(this.view.width / 4, this.view.height / 4);

        this.item = "";
        this.itemSprite = SpriteFactory.build(this.item);

        this.view.addChild(this.background);
        this.update(0x777777, 0x444444);
    }

    setItem(item: string) {
        if (this.itemSprite) {
            this.view.removeChild(this.itemSprite);
        }
        this.item = item;
        this.itemSprite = SpriteFactory.update(
            this.itemSprite,
            undefined,
            this.item
        );
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
        if (this.callback) {
            this.callback(this.item);
        }
    }
}
