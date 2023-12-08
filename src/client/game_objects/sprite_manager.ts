import * as PIXI from "pixi.js";
import { AnimationManager } from "../../lib/animation";

type Parts = {
    container: PIXI.Container;
    [key: string]: Parts | PIXI.Container | PIXI.Sprite;
};

export interface SpriteManager {
    parts: Parts;
    animationManager: AnimationManager;
}
