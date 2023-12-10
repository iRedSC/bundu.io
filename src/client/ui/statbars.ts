import * as PIXI from "pixi.js";
import { ProgressBar } from "@pixi/ui";

export const barContainer = new PIXI.Container
let value = 10


let progressBar = new ProgressBar({
    bg: './assets/health.svg',
    fill: './assets/health_bar.png',
    progress: value,
    fillPaddings: {
        top: 10,
        left: 4,
    }
});
barContainer.position.set(
    (window.innerWidth - barContainer.width) / 2,
    window.innerHeight - 500
);
barContainer.addChild(progressBar);
