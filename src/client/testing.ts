import { Viewport } from "pixi-viewport";
import { Structure } from "./game_objects/structure";
import { randomInt } from "../lib/math";
import { loadGround } from "./ground";
import { WORLD_SIZE } from "./constants";
import { Sky } from "./sky";

export function createStuff(
    viewport: Viewport,
    all_objects: any[],
    structures: any[]
) {
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

    // for (let i = 0; i < 50; i++) {
    //     const ground = loadGround(
    //         viewport,
    //         [
    //             [randomInt(0, WORLD_SIZE), randomInt(0, WORLD_SIZE)],
    //             [randomInt(0, WORLD_SIZE), randomInt(0, WORLD_SIZE)],
    //         ],
    //         randomHexColor()
    //     );
    //     all_objects.push(ground);
    // }

    for (let i = 0; i < 500; i++) {
        const structure = new Structure(
            i,
            [
                randomInt(5000, WORLD_SIZE - 5000),
                randomInt(5000, WORLD_SIZE - 5000),
            ],
            randomInt(3, 5),
            randomInt(0, Math.PI * 360),
            "stone"
        );
        viewport.addChild(structure.parts.container);
        all_objects.push(structure);
        structures.push(structure);
    }
    for (let i = 0; i < 50; i++) {
        const structure = new Structure(
            i,
            [
                randomInt(5000, WORLD_SIZE - 5000),
                randomInt(5000, WORLD_SIZE - 5000),
            ],
            randomInt(3, 5),
            randomInt(0, Math.PI * 360),
            "amethyst"
        );
        viewport.addChild(structure.parts.container);
        all_objects.push(structure);
        structures.push(structure);
    }
    for (let i = 0; i < 10; i++) {
        const structure = new Structure(
            i,
            [
                randomInt(5000, WORLD_SIZE - 5000),
                randomInt(5000, WORLD_SIZE - 5000),
            ],
            randomInt(3, 5),
            randomInt(0, Math.PI * 360),
            "diamond"
        );
        viewport.addChild(structure.parts.container);
        all_objects.push(structure);
        structures.push(structure);
    }

    for (let i = 0; i < 100; i++) {
        const structure = new Structure(
            i,
            [
                randomInt(5000, WORLD_SIZE - 5000),
                randomInt(5000, WORLD_SIZE - 5000),
            ],
            3,
            randomInt(0, Math.PI * 360),
            "gold"
        );
        viewport.addChild(structure.parts.container);
        all_objects.push(structure);
        structures.push(structure);
    }

    for (let i = 0; i < 500; i++) {
        const structure = new Structure(
            i,
            [
                randomInt(5000, WORLD_SIZE - 5000),
                randomInt(5000, WORLD_SIZE - 5000),
            ],
            randomInt(5, 10),
            randomInt(0, Math.PI * 360),
            "pine_tree2"
        );
        viewport.addChild(structure.parts.container);
        all_objects.push(structure);
        structures.push(structure);
    }
    for (let i = 0; i < 500; i++) {
        const structure = new Structure(
            i,
            [
                randomInt(5000, WORLD_SIZE - 5000),
                randomInt(5000, WORLD_SIZE - 5000),
            ],
            randomInt(5, 10),
            randomInt(0, Math.PI * 360),
            "pine_tree"
        );
        viewport.addChild(structure.parts.container);
        all_objects.push(structure);
        structures.push(structure);
    }
}
