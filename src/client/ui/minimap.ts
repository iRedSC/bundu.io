import { Container, Sprite } from "pixi.js";
import { SpriteFactory } from "../assets/sprite_factory";
import { OutlineFilter } from "@pixi/filter-outline";
import { Animation } from "../../lib/animations";
import { distance, lerp } from "../../lib/transforms";
import { UIAnimationManager } from "./animation_manager";
import { percentOf } from "../../lib/math";
import { ITEM_BUTTON_SIZE } from "../constants";

export class Minimap {
    container: Container;
    sprite: Sprite;
    player: Sprite;

    large: boolean = false;
    hovering: boolean = false;

    constructor() {
        this.container = new Container();
        this.sprite = SpriteFactory.build("minimap");
        this.player = SpriteFactory.build("player");
        this.sprite.anchor.set(0.5);
        this.player.anchor.set(0.5);

        this.player.width = 100;
        this.player.height = 100;
        this.player.filters = [new OutlineFilter(2, 0xfcba03)];

        this.sprite.width = 2000;
        this.sprite.height = 2000;

        this.container.addChild(this.sprite);
        this.container.addChild(this.player);
        this.container.scale.set(0.15);
        this.container.pivot.set(this.sprite.height / 2, this.sprite.width / 2);
        this.container.alpha = 0.9;

        this.container.eventMode = "static";
        this.container.onpointerup = () => {
            this.large = !this.large;
            if (!this.large) this.hovering = false;
        };

        this.container.onpointerenter = () => {
            this.hovering = true;
        };

        this.container.onpointerleave = () => {
            this.hovering = false;
        };

        UIAnimationManager.set(this, 0, minimapAnimation(this).run(), true);
    }

    set(x: number, y: number) {
        this.player.position.set(x / 10 - 1000, y / 10 - 1000);
    }

    rotate(rotation: number) {
        this.player.rotation = rotation;
    }

    resize() {
        this.container.position.set(
            percentOf(100, window.innerWidth) - percentOf(10, ITEM_BUTTON_SIZE),
            percentOf(100, window.innerHeight) - percentOf(10, ITEM_BUTTON_SIZE)
        );
    }
}

function minimapAnimation(minimap: Minimap) {
    const animation = new Animation();

    animation.keyframes[0] = () => {
        if (minimap.large) {
            minimap.container.scale.set(
                lerp(minimap.container.scale.x, 0.4, 0.025)
            );
            minimap.container.alpha = lerp(
                minimap.container.alpha,
                0.75,
                0.025
            );
            return;
        }

        if (minimap.hovering) {
            minimap.container.scale.set(
                lerp(minimap.container.scale.x, 0.2, 0.05)
            );
            return;
        }
        minimap.container.scale.set(
            lerp(minimap.container.scale.x, 0.15, 0.05)
        );
        minimap.container.alpha = lerp(minimap.container.alpha, 0.9, 0.05);
    };

    return animation;
}
