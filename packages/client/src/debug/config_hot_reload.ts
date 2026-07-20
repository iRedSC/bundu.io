import { Animal } from "../world/objects/animal";
import { Player } from "../world/objects/player";
import { Structure } from "../world/objects/structure";
import type { World } from "../world/world";
import {
    replaceModelDefs,
    type ModelDefs,
} from "../models/defs";
import { applyClientGameplay } from "../models/shadow";
import { applyStatBars } from "../ui/stat_bars_config";
import { applyLang } from "../lang/lang";

function reapplyModelDefs(world: World) {
    for (const object of world.objects.all()) {
        if (object instanceof Player) {
            object.reloadModelDefinition();
        } else if (object instanceof Animal) {
            object.reloadModelDefinition();
        } else if (object instanceof Structure) {
            object.reloadModelDefinition();
            world.reregisterObject(object);
        }
    }
    world.refreshPlacementGhost();
}

/**
 * Watches pack YAML (models + client gameplay) and hot-applies.
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
                const [defsRes, gameplayRes, statBarsRes, langRes] =
                    await Promise.all([
                        fetch(`/__dev/model-defs?t=${timestamp}`),
                        fetch(`/__dev/client-gameplay?t=${timestamp}`),
                        fetch(`/__dev/client-stat-bars?t=${timestamp}`),
                        fetch(`/__dev/client-lang?t=${timestamp}`),
                    ]);
                if (!defsRes.ok) {
                    console.warn(
                        "[config-hot-reload] model-defs fetch failed:",
                        defsRes.status
                    );
                    continue;
                }
                const defs = (await defsRes.json()) as ModelDefs;
                replaceModelDefs(defs);
                reapplyModelDefs(world);
                console.info(
                    "[config-hot-reload] model definitions applied",
                    `(${Object.keys(defs).length} files)`
                );
                if (gameplayRes.ok) {
                    applyClientGameplay(await gameplayRes.json());
                    console.info("[config-hot-reload] client gameplay applied");
                } else {
                    console.warn(
                        "[config-hot-reload] client-gameplay fetch failed:",
                        gameplayRes.status
                    );
                }
                if (statBarsRes.ok) {
                    applyStatBars(await statBarsRes.json());
                    console.info("[config-hot-reload] client stat bars applied");
                } else {
                    console.warn(
                        "[config-hot-reload] client-stat-bars fetch failed:",
                        statBarsRes.status
                    );
                }
                if (langRes.ok) {
                    applyLang(await langRes.json());
                    console.info("[config-hot-reload] client lang applied");
                } else {
                    console.warn(
                        "[config-hot-reload] client-lang fetch failed:",
                        langRes.status
                    );
                }
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
