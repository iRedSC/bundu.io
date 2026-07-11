import { file, serve } from "bun";
import path from "path";
import fs from "fs";

const PUBLIC_DIR = path.join(import.meta.dir, "public");
const CONFIG_DIR = path.join(
    import.meta.dir,
    "packages/client/src/configs"
);
const PORT = Number(process.env.PORT ?? 3000);
/** Dev-only display-config hot-reload. Never enabled in CI/prod images. */
const DEV_CONFIG_RELOAD = process.env.BUNDU_DEBUG === "1";

const SPRITES_YML = path.join(CONFIG_DIR, "sprites.yml");
const SPRITE_TYPES_YML = path.join(CONFIG_DIR, "sprite_types.yml");

type SseClient = {
    write: (chunk: string) => void;
};

const sseClients = new Set<SseClient>();

function notifyConfigReload() {
    let live = 0;
    for (const client of [...sseClients]) {
        try {
            client.write("data: reload\n\n");
            live++;
        } catch {
            sseClients.delete(client);
        }
    }
    console.log(
        `[static] notified ${live} client(s) (tracked ${sseClients.size})`
    );
}

function configReloadSse(): Response {
    let client: SseClient | undefined;
    const stream = new ReadableStream({
        start(controller) {
            const encoder = new TextEncoder();
            client = {
                write: (chunk) => controller.enqueue(encoder.encode(chunk)),
            };
            sseClients.add(client);
            client.write(": connected\n\n");
        },
        cancel() {
            if (client) {
                sseClients.delete(client);
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}

async function spriteConfigsJson(): Promise<Response> {
    // Dynamic import so prod images (no packages/) never load client config code.
    const { buildSpriteConfigs } = await import(
        "./packages/client/src/configs/build_sprite_configs"
    );
    const sprites = Bun.YAML.parse(fs.readFileSync(SPRITES_YML, "utf8"));
    const spriteTypes = Bun.YAML.parse(
        fs.readFileSync(SPRITE_TYPES_YML, "utf8")
    );
    return Response.json(buildSpriteConfigs(sprites, spriteTypes), {
        headers: {
            "Cache-Control": "no-store",
        },
    });
}

if (DEV_CONFIG_RELOAD) {
    let debounce: Timer | undefined;
    fs.watch(CONFIG_DIR, { recursive: true }, (_event, filename) => {
        if (!filename || !/\.ya?ml$/i.test(filename)) return;
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            console.log(`[static] configs changed (${filename}) — hot-reload`);
            notifyConfigReload();
        }, 100);
    });

    // Keep SSE connections alive past Bun's default idle timeout.
    setInterval(() => {
        for (const client of [...sseClients]) {
            try {
                client.write(": ping\n\n");
            } catch {
                sseClients.delete(client);
            }
        }
    }, 15_000);
}

serve({
    port: PORT,
    // SSE stays open; default idleTimeout (10s) drops the hot-reload channel.
    ...(DEV_CONFIG_RELOAD ? { idleTimeout: 0 } : {}),
    async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/") {
            return Response.redirect(new URL("/site/", url), 302);
        }

        if (DEV_CONFIG_RELOAD) {
            if (url.pathname === "/__dev/config-reload") {
                return configReloadSse();
            }
            if (url.pathname === "/__dev/sprite-configs") {
                try {
                    return await spriteConfigsJson();
                } catch (err) {
                    console.error("[static] failed to build sprite configs", err);
                    return new Response("Config error", { status: 500 });
                }
            }
        }

        let pathname = url.pathname.endsWith("/")
            ? `${url.pathname}index.html`
            : url.pathname;
        let filepath = path.join(PUBLIC_DIR, pathname);

        // Security: prevent directory traversal
        if (!filepath.startsWith(PUBLIC_DIR)) {
            return new Response("Forbidden", { status: 403 });
        }

        try {
            const stat = fs.statSync(filepath);
            if (stat.isFile()) return new Response(file(filepath));
            return new Response("Not Found", { status: 404 });
        } catch {
            return new Response("Not Found", { status: 404 });
        }
    },
});

console.log(`Client running at http://localhost:${PORT}/site/`);
if (DEV_CONFIG_RELOAD) {
    console.log("[static] display config hot-reload enabled");
}
