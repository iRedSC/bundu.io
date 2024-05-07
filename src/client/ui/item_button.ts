// import { Button } from "@pixi/ui";
import { Container } from "pixi.js";
import { SpriteFactory, SpriteWrapper } from "../assets/sprite_factory";
import { idMap } from "../configs/id_map";

export class ItemButton {
    button: Container;
    enabled: boolean;

    background: SpriteWrapper;

    disableSprite: SpriteWrapper;
    itemSprite: SpriteWrapper;

    hovering: boolean = false;
    down: boolean = false;
    rightDown: boolean = false;
    private _item: number | null = null;

    rightclick?: (item: number, shift?: boolean) => void;
    leftclick?: (item: number, shift?: boolean) => void;

    constructor() {
        this.enabled = true;

        this.button = new Container();
        this.button.sortableChildren = true;
        this.button.eventMode = "static";

        // this.background = new PIXI.Graphics();
        this.background = SpriteFactory.build("item_button");
        this.background.width = 68;
        this.background.height = 68;
        this.background.tint = 0x777777;
        this.background.anchor.set(0.5);

        this.disableSprite = SpriteFactory.build("item_button");

        this.disableSprite.width = 68;
        this.disableSprite.height = 68;
        this.disableSprite.tint = 0x000000;
        this.disableSprite.alpha = 0.5;
        this.disableSprite.zIndex = 1000;
        this.disableSprite.visible = false;
        this.disableSprite.anchor.set(0.5);

        this.itemSprite = SpriteFactory.build(this._item ?? -1);

        this.button.addChild(this.itemSprite);
        this.button.addChild(this.background);
        this.button.addChild(this.disableSprite);
        this.button.sortChildren();

        this.button.onmouseover = () => {
            this.hovering = true;
        };

        this.button.onmouseleave = () => {
            this.hovering = false;
        };

        this.button.onpointerdown = (ev) => {
            if (ev?.button === 2) {
                this.rightDown = true;
            }
            this.down = true;
        };

        this.button.onpointerup = (ev) => {
            if (ev?.button === 2) {
                if (this.rightclick && this.item !== null) {
                    this.rightclick(this.item, ev?.shiftKey);
                }
            } else if (ev?.button === 0) {
                if (this.leftclick && this.item !== null) {
                    this.leftclick(this.item, ev?.shiftKey);
                }
            }
            this.down = false;
            this.rightDown = false;
        };

        this.button.onpointerupoutside = () => {
            this.down = false;
            this.rightDown = false;
        };
    }

    disable() {
        this.enabled = false;
        this.disableSprite.visible = true;
        this.button.eventMode = "none";
    }

    enable() {
        this.enabled = true;
        this.disableSprite.visible = false;
        this.button.eventMode = "static";
    }

    set item(item: number | null) {
        const name = idMap.getv(item ?? -1);
        if (!name) {
            this._item = null;
            this.itemSprite = SpriteFactory.update(
                this.itemSprite,
                undefined,
                ""
            );
            this.itemSprite.visible = false;
            return;
        }
        this._item = item;
        this.itemSprite = SpriteFactory.update(
            this.itemSprite,
            undefined,
            name
        );
        this.itemSprite.visible = true;
        this.itemSprite.width = 65;
        this.itemSprite.height = 65;
        this.itemSprite.zIndex = 1;
        this.itemSprite.anchor.set(0.5);
    }

    get item() {
        return this._item;
    }

    get position() {
        return this.button.position;
    }
}
