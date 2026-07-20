/**
 * Capture the current Pixi frame with selected stage children hidden (e.g. HUD).
 */

import type { Application, Container } from "pixi.js";

/** JPEG quality for death-screen snapshots — good enough for a drifting backdrop. */
const CAPTURE_QUALITY = 0.85;

/**
 * Hide `overlay` containers, force a render, and return a JPEG data URL of the
 * canvas (world only). Restores visibility even if capture fails.
 */
export function captureFrameWithoutUi(
    app: Application,
    overlays: readonly Container[]
): string | null {
    const previous = overlays.map((c) => c.visible);
    for (const c of overlays) c.visible = false;
    try {
        app.render();
        return app.canvas.toDataURL("image/jpeg", CAPTURE_QUALITY);
    } catch (error) {
        console.warn("Failed to capture death frame", error);
        return null;
    } finally {
        overlays.forEach((container, i) => {
            container.visible = previous[i] ?? container.visible;
        });
    }
}
