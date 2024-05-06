import { ColorSource, Container, Graphics } from "pixi.js";
import { SpriteFactory, SpriteWrapper } from "../assets/sprite_factory";
import { Animation, AnimationManager } from "../../lib/animations";
import { lerp, radians } from "../../lib/transforms";

export class Timer {
    duration: number;
    animation: Animation;

    container: Container;
    sprite: SpriteWrapper;
    arc: Graphics;
    color: ColorSource;

    constructor(sprite: string, color: ColorSource = 0xffffff) {
        this.color = color;
        this.container = new Container();
        this.sprite = SpriteFactory.build(sprite);
        this.sprite.width = 50;
        this.sprite.height = 50;
        this.sprite.anchor.set(0.5);
        this.arc = new Graphics();
        this.container.addChild(this.sprite);
        this.container.addChild(this.arc);

        this.duration = 0;
        this.animation = timerAnimation(this);
    }

    set(duration: number, manager: AnimationManager) {
        this.duration = duration;
        manager.set(this, 0, this.animation.run(), true);
    }
}

function timerAnimation(timer: Timer) {
    const animation = new Animation();

    animation.keyframes[0] = (animation) => {
        animation.next(timer.duration);
    };

    animation.keyframes[1] = (animation) => {
        timer.arc.clear();
        timer.arc.lineStyle({ width: 10, color: timer.color });
        timer.arc.arc(
            0,
            0,
            50,
            radians(-90),
            lerp(radians(-90), radians(275), animation.t)
        );
    };
    return animation;
}
