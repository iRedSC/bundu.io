import { Viewport } from "pixi-viewport";
import { Structure } from "./game_objects/structure";
import { randomHexColor, randomInt } from "../lib/math";
import { loadGround } from "./ground";

export function createStuff(viewport: Viewport, all_objects: any[]) {
    all_objects.push(
        loadGround(
            viewport,
            [
                [0, 0],
                [viewport.worldWidth, viewport.worldHeight],
            ],
            0x16a0ca
        )
    );

    all_objects.push(
        loadGround(
            viewport,
            [
                [5000, 5000],
                [viewport.worldWidth - 5000, viewport.worldHeight - 5000],
            ],
            0x1b6430
        )
    );

    for (let i = 0; i < 50; i++) {
        const ground = loadGround(
            viewport,
            [
                [randomInt(0, 40000), randomInt(0, 40000)],
                [randomInt(0, 40000), randomInt(0, 40000)],
            ],
            randomHexColor()
        );
        all_objects.push(ground);
    }

    for (let i = 0; i < 50; i++) {
        const structure = new Structure(
            i,
            [randomInt(0, 40000), randomInt(0, 40000)],
            randomInt(3, 5),
            randomInt(0, Math.PI * 360),
            "stone"
        );
        viewport.addChild(structure.parts.container);
        all_objects.push(structure);
    }

    for (let i = 0; i < 50; i++) {
        const structure = new Structure(
            i,
            [randomInt(0, 40000), randomInt(0, 40000)],
            3,
            randomInt(0, Math.PI * 360),
            "red_wall"
        );
        viewport.addChild(structure.parts.container);
        all_objects.push(structure);
    }

    for (let i = 0; i < 50; i++) {
        const structure = new Structure(
            i,
            [randomInt(0, 40000), randomInt(0, 40000)],
            randomInt(5, 10),
            randomInt(0, Math.PI * 360),
            "pine_tree2"
        );
        viewport.addChild(structure.parts.container);
        all_objects.push(structure);
    }
}
