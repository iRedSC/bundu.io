/**
 * Capture death-screen layers: world (zooms) and UI (stays put).
 */

import { Rectangle, type Application, type Container } from "pixi.js";

/** JPEG quality for the world backdrop. */
const WORLD_QUALITY = 0.85;

export type DeathCapture = {
    world: string | null;
    ui: string | null;
};

function screenFrame(app: Application): Rectangle {
    return new Rectangle(0, 0, app.screen.width, app.screen.height);
}

/**
 * Snapshot world and currently-visible UI separately so the death screen can
 * zoom the world without transforming the HUD.
 */
export function captureDeathLayers(
    app: Application,
    worldRoots: readonly Container[],
    uiRoots: readonly Container[]
): DeathCapture {
    const worldPrev = worldRoots.map((c) => c.visible);
    const uiPrev = uiRoots.map((c) => c.visible);
    let world: string | null = null;
    let ui: string | null = null;

    try {
        for (const c of uiRoots) c.visible = false;
        for (const c of worldRoots) c.visible = true;
        app.render();
        world = app.canvas.toDataURL("image/jpeg", WORLD_QUALITY);

        for (const c of worldRoots) c.visible = false;
        // Only layers that were on-screen (e.g. HUD xor freecam editor).
        uiRoots.forEach((c, i) => {
            c.visible = uiPrev[i] ?? false;
        });
        // Extract to a transparent RT — main canvas was init opaque.
        const uiCanvas = app.renderer.extract.canvas({
            target: app.stage,
            frame: screenFrame(app),
            resolution: app.renderer.resolution,
            clearColor: [0, 0, 0, 0],
        });
        ui = uiCanvas.toDataURL?.("image/png") ?? null;
    } catch (error) {
        console.warn("Failed to capture death layers", error);
    } finally {
        worldRoots.forEach((c, i) => {
            c.visible = worldPrev[i] ?? c.visible;
        });
        uiRoots.forEach((c, i) => {
            c.visible = uiPrev[i] ?? c.visible;
        });
    }

    return { world, ui };
}
