import {
    spriteConfigs,
    type FullItemConfig,
} from "@client/configs/sprite_configs";
import { Player } from "../world/objects/player";
import { Structure } from "../world/objects/structure";
import type { World } from "../world/world";

function replaceSpriteConfigs(configs: Record<string, FullItemConfig>) {
    spriteConfigs.clear();
    for (const [name, config] of Object.entries(configs)) {
        spriteConfigs.set(name, config);
    }
}

function reapplyDisplays(world: World) {
    for (const object of world.objects.all()) {
        if (object instanceof Player) {
            object.updateEquipment();
            const ghost = object.getStructureGhost();
            if (ghost) {
                object.setSelectedStructure(ghost.id, ghost.scale);
            }
        } else if (object instanceof Structure) {
            object.refreshSpriteConfig();
        }
    }
}

/**
 * Watches for display-config YAML changes via the static server SSE channel
 * and swaps the live `spriteConfigs` Map without a browser refresh.
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
                const res = await fetch(
                    `/__dev/sprite-configs?t=${Date.now()}`
                );
                if (!res.ok) {
                    console.warn(
                        "[config-hot-reload] fetch failed:",
                        res.status,
                        res.statusText
                    );
                    continue;
                }
                const configs = (await res.json()) as Record<
                    string,
                    FullItemConfig
                >;
                replaceSpriteConfigs(configs);
                reapplyDisplays(world);
                const sample =
                    configs.diamond_pickaxe?.hand_display ??
                    configs.wood_pickaxe?.hand_display;
                console.info(
                    "[config-hot-reload] display configs applied",
                    sample
                        ? { hand_display: sample }
                        : `(${Object.keys(configs).length} items)`
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
