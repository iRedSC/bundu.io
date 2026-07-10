import { Container } from "pixi.js";
import { SpriteFactory, ContaineredSprite } from "../assets/sprite_factory";
import { ITEM_BUTTON_SIZE } from "../constants";
import { percentOf } from "@bundu/shared/math";
import { getStringId } from "@bundu/shared/id_map";
import {
    colorLerp,
    lerp,
    radians,
    rotationLerp,
} from "@bundu/shared/transforms";

export type ItemButtonColors = {
    empty: number;
    default: number;
    hover: number;
    down: number;
    rightDown: number;
};

/** Tween hover/press/idle scale+tint+wobble from interaction state. */
export function tickItemButton(
    button: ItemButton,
    colors: ItemButtonColors,
    restY = 0
) {
    if (button.rightDown && button.item) {
        button.button.scale.set(lerp(button.button.scale.x, 0.8, 0.2));
        button.background.tint = colorLerp(
            Number(button.background.tint),
            colors.rightDown,
            0.2
        );
        button.background.position.y = lerp(
            button.background.position.y,
            restY - 10,
            0.2
        );
        button.itemSprite.position.y = lerp(
            button.itemSprite.position.y,
            restY - 10,
            0.2
        );
        button.background.rotation = lerp(
            button.background.rotation,
            radians(45),
            0.2
        );
        return;
    }

    button.background.rotation = lerp(
        button.background.rotation,
        radians(0),
        0.2
    );
    button.background.position.y = lerp(
        button.background.position.y,
        restY,
        0.2
    );
    button.itemSprite.position.y = lerp(
        button.itemSprite.position.y,
        restY,
        0.2
    );

    if (button.down && button.item) {
        button.button.scale.set(lerp(button.button.scale.x, 0.8, 0.2));
        button.background.tint = colorLerp(
            Number(button.background.tint),
            colors.down,
            0.2
        );
        return;
    }
    if (button.hovering) {
        button.background.rotation = rotationLerp(
            button.background.rotation,
            Math.sin(Date.now() / 500) * 0.3,
            0.2
        );
        button.button.scale.set(lerp(button.button.scale.x, 1.1, 0.1));
        if (button.item)
            button.background.tint = colorLerp(
                Number(button.background.tint),
                colors.hover,
                0.1
            );
        return;
    }

    button.button.scale.set(lerp(button.button.scale.x, 1, 0.1));
    if (button.item) {
        button.background.tint = colorLerp(
            Number(button.background.tint),
            colors.default,
            0.1
        );
        return;
    }
    button.background.tint = colorLerp(
        Number(button.background.tint),
        colors.empty,
        0.1
    );
}

export class ItemButton {
    button: Container;
    enabled: boolean = true;
    sendEvents: boolean = true;

    background: ContaineredSprite;

    disableSprite: ContaineredSprite;
    itemSprite: ContaineredSprite;

    hovering: boolean = false;
    down: boolean = false;
    rightDown: boolean = false;
    private _item: number | null = null;
    private _touchDown: boolean = false;

    rightclick?: (item: number, shift: boolean) => void;
    leftclick?: (item: number, shift: boolean) => void;

    constructor() {
        this.button = new Container();
        this.button.sortableChildren = true;
        this.button.eventMode = "static";

        // this.background = new PIXI.Graphics();
        this.background = SpriteFactory.build("item_button");
        this.background.width = ITEM_BUTTON_SIZE;
        this.background.height = ITEM_BUTTON_SIZE;
        this.background.tint = 0x777777;
        this.background.anchor.set(0.5);

        this.disableSprite = SpriteFactory.build("item_button");

        this.disableSprite.width = ITEM_BUTTON_SIZE;
        this.disableSprite.height = ITEM_BUTTON_SIZE;
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

        this.button.onpointerenter = () => {
            this.hovering = true;
        };

        this.button.onpointerleave = () => {
            this.hovering = false;
            if (this._touchDown) {
                this.rightDown = true;
            }
        };

        this.button.onpointerdown = (ev) => {
            if (ev?.button === 2) {
                this.rightDown = true;
            }
            this.down = true;
        };

        this.button.ontouchstart = () => {
            this._touchDown = true;
        };

        this.button.ontouchendoutside = (ev) => {
            if (this.rightclick && this.item !== null) {
                this.rightclick(this.item, ev?.shiftKey ?? false);
            }
            this.down = false;
            this.rightDown = false;
            this._touchDown = false;
        };

        this.button.onpointerup = (ev) => {
            if (ev?.button === 2) {
                if (this.rightclick && this.item !== null && this.sendEvents) {
                    this.rightclick(this.item, ev?.shiftKey ?? false);
                }
            } else if (ev?.button === 0 && this.sendEvents) {
                if (this.leftclick && this.item !== null) {
                    this.leftclick(this.item, ev?.shiftKey ?? false);
                }
            }
            this.down = false;
            this.rightDown = false;
            this._touchDown = false;
        };

        this.button.onpointerupoutside = () => {
            this.down = false;
            this.rightDown = false;
            this._touchDown = false;
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
        const name = getStringId(item);
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
        this.itemSprite.width = percentOf(90, ITEM_BUTTON_SIZE);
        this.itemSprite.height = percentOf(90, ITEM_BUTTON_SIZE);
        this.itemSprite.zIndex = 1;
        this.itemSprite.anchor.set(0.5);
    }

    get item() {
        return this._item;
    }

    get position() {
        return this.button.position;
    }

    destroy(): void {
        // Remove all event listeners
        this.button.removeAllListeners();
        this.button.onpointerenter = null;
        this.button.onpointerleave = null;
        this.button.onpointerdown = null;
        this.button.onpointerup = null;
        this.button.onpointerupoutside = null;
        this.button.ontouchstart = null;
        this.button.ontouchendoutside = null;

        // Destroy contained sprites
        this.background.destroy();
        this.disableSprite.destroy();
        this.itemSprite.destroy();

        // Destroy container
        this.button.destroy({ children: false });
    }
}
