import { Container, Sprite, Text } from "pixi.js";
import { SpriteFactory } from "../assets/sprite_factory";
import { OutlineFilter } from "@pixi/filter-outline";
import { Animation } from "../../lib/animations";
import { distance, lerp } from "../../lib/transforms";
import { UIAnimationManager } from "./animation_manager";
import { percentOf } from "../../lib/math";
import { ITEM_BUTTON_SIZE } from "../constants";
import { TEXT_STYLE } from "../assets/text";

export class Minimap {
    container: Container;
    sprite: Sprite;
    players: Map<
        number,
        { name: Text; sprite: Sprite; color: number; hovering: boolean }
    >;

    large: boolean = false;
    hovering: boolean = false;

    constructor() {
        this.players = new Map();
        this.container = new Container();
        this.sprite = SpriteFactory.build("minimap");

        this.sprite.anchor.set(0.5);

        this.sprite.width = 2000;
        this.sprite.height = 2000;

        this.container.addChild(this.sprite);

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

    addPlayer(id: number, name: string, color: number, x: number, y: number) {
        const player = {
            name: new Text(name, TEXT_STYLE),
            color: color,
            sprite: SpriteFactory.build("player"),
            hovering: false,
        };
        this.players.set(id, player);
        player.sprite.anchor.set(0.5);
        player.sprite.scale.set(0.1);

        player.name.anchor.set(0.5, 1.5);
        player.name.scale.set(1.5);
        // 0xfcba03
        player.sprite.filters = [new OutlineFilter(2, color)];
        this.container.addChild(player.sprite);
        this.container.addChild(player.name);
        this.setPlayerPosition(id, x, y);

        player.sprite.eventMode = "static";
        player.sprite.onpointerenter = () => {
            player.hovering = true;
        };

        player.sprite.onpointerleave = () => {
            player.hovering = false;
        };

        UIAnimationManager.set(player, 0, playerAnimation(player).run(), true);
    }

    setPlayerPosition(id: number, x: number, y: number) {
        const player = this.players.get(id);
        if (!player) return;
        player.sprite.position.set(x / 10 - 1000, y / 10 - 1000);
        player.name.position.set(x / 10 - 1000, y / 10 - 1000);
    }

    setPlayerRotation(id: number, rotation: number) {
        const player = this.players.get(id);
        if (player) player.sprite.rotation = rotation;
    }

    resize() {
        this.container.position.set(
            percentOf(100, window.innerWidth) - percentOf(10, ITEM_BUTTON_SIZE),
            percentOf(100, window.innerHeight) - percentOf(10, ITEM_BUTTON_SIZE)
        );
    }
}

function playerAnimation(player: {
    name: Text;
    sprite: Sprite;
    hovering: boolean;
}) {
    const animation = new Animation();

    animation.keyframes[0] = () => {
        if (player.hovering) {
            player.sprite.scale.set(lerp(player.sprite.scale.x, 0.125, 0.05));
            player.name.scale.set(lerp(player.name.scale.x, 1.5, 0.05));
            return;
        }

        player.sprite.scale.set(lerp(player.sprite.scale.x, 0.1, 0.05));
        player.name.scale.set(lerp(player.name.scale.x, 0, 0.15));
    };

    return animation;
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
