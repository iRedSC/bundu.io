/**
 * Capture the current Pixi frame as a JPEG data URL.
 */

import type { Application } from "pixi.js";

/** JPEG quality for death-screen snapshots — good enough for a drifting backdrop. */
const CAPTURE_QUALITY = 0.85;

/**
 * Force a render and return a JPEG data URL of the canvas (world + HUD).
 */
export function captureFrame(app: Application): string | null {
    try {
        app.render();
        return app.canvas.toDataURL("image/jpeg", CAPTURE_QUALITY);
    } catch (error) {
        console.warn("Failed to capture death frame", error);
        return null;
    }
}
