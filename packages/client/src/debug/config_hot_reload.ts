import { Animal } from "../world/objects/animal";
import { Player } from "../world/objects/player";
import { Structure } from "../world/objects/structure";
import type { World } from "../world/world";
import {
    replaceVisualDefs,
    type VisualDefs,
} from "../visual/defs";

function reapplyVisualDefs(world: World) {
    for (const object of world.objects.all()) {
        if (object instanceof Player) {
            object.reloadVisualDefinition();
        } else if (object instanceof Animal) {
            object.reloadVisualDefinition();
        } else if (object instanceof Structure) {
            object.reloadVisualDefinition();
            world.reregisterObject(object);
        }
    }
    world.refreshPlacementGhost();
}

/**
 * Watches visual-definition YAML and atomically replaces the live registry.
 * Debug builds only — must not ship in prod (see check-prod-debug).
 */
export function startConfigHotReload(world: World): () => void {
    const source = new EventSource("/__dev/config-reload");
    let reloading = false;
    let pending = false;

    const reload = async () => {
        if (reloading) {
            pending = true;
            return;
        }
        reloading = true;
        try {
            do {
                pending = false;
                const timestamp = Date.now();
                const defsRes = await fetch(
                    `/__dev/visual-defs?t=${timestamp}`
                );
                if (!defsRes.ok) {
                    console.warn(
                        "[config-hot-reload] fetch failed:",
                        defsRes.status
                    );
                    continue;
                }
                const defs = (await defsRes.json()) as VisualDefs;
                replaceVisualDefs(defs);
                reapplyVisualDefs(world);
                console.info(
                    "[config-hot-reload] visual definitions applied",
                    `(${Object.keys(defs).length} files)`
                );
            } while (pending);
        } catch (err) {
            console.warn("[config-hot-reload] reload failed", err);
        } finally {
            reloading = false;
        }
    };

    let openedOnce = false;
    source.onopen = () => {
        // Reconnect after static-server restart — pick up any missed edits.
        if (openedOnce) void reload();
        openedOnce = true;
    };
    source.onmessage = () => {
        void reload();
    };
    source.onerror = () => {
        // Browser auto-reconnects EventSource; avoid spamming logs.
    };

    return () => source.close();
}
