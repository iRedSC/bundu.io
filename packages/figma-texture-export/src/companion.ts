import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
    COMPANION_PORT,
    isValidNamespace,
    texturesRoot,
} from "./paths";

type PushFile = {
    relativePath: string;
    svg: string;
};

type PushBody = {
    namespace: string;
    files: PushFile[];
};

const repoRoot = resolve(import.meta.dir, "../../..");

/** Figma plugin UI runs in a sandboxed iframe (`Origin: null`). Reject any other browser origin. */
const ALLOWED_BROWSER_ORIGINS = new Set(["null"]);

const server = Bun.serve({
    port: COMPANION_PORT,
    hostname: "127.0.0.1",
    async fetch(request) {
        const origin = request.headers.get("Origin");
        if (origin !== null && !ALLOWED_BROWSER_ORIGINS.has(origin)) {
            return Response.json({ error: "Origin not allowed." }, { status: 403 });
        }

        const headers = corsHeaders(origin);
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers });
        }

        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/health") {
            return Response.json({ ok: true }, { headers });
        }

        if (request.method === "POST" && url.pathname === "/push") {
            try {
                const body = (await request.json()) as PushBody;
                const result = await pushFiles(body);
                return Response.json(result, { headers });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : "Push failed.";
                return Response.json({ error: message }, { status: 400, headers });
            }
        }

        return Response.json({ error: "Not found." }, { status: 404, headers });
    },
});

console.log(`Bundu texture companion listening on http://127.0.0.1:${server.port}`);
console.log(`Writing into ${repoRoot}/packs/<namespace>/defs/<namespace>/client/textures`);

function corsHeaders(origin: string | null): HeadersInit {
    const headers: Record<string, string> = {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        Vary: "Origin",
    };
    if (origin !== null && ALLOWED_BROWSER_ORIGINS.has(origin)) {
        headers["Access-Control-Allow-Origin"] = origin;
    }
    return headers;
}

async function pushFiles(body: PushBody): Promise<{ written: string[]; overwritten: string[] }> {
    if (!body || typeof body.namespace !== "string" || !isValidNamespace(body.namespace)) {
        throw new Error("Namespace must match /^[a-z][a-z0-9_]*$/.");
    }
    if (!Array.isArray(body.files) || body.files.length === 0) {
        throw new Error("No files to push.");
    }

    const root = texturesRoot(repoRoot, body.namespace);
    const written: string[] = [];
    const overwritten: string[] = [];

    for (const file of body.files) {
        const relativePath = sanitizeRelativePath(file.relativePath);
        if (typeof file.svg !== "string" || file.svg.length === 0) {
            throw new Error(`Missing SVG for ${relativePath}.`);
        }

        const absolutePath = resolve(root, relativePath);
        if (!absolutePath.startsWith(root + "/") && absolutePath !== root) {
            throw new Error(`Refusing path outside textures root: ${relativePath}`);
        }

        const existed = await Bun.file(absolutePath).exists();
        await mkdir(dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, file.svg, "utf8");
        written.push(relativePath);
        if (existed) overwritten.push(relativePath);
    }

    return { written, overwritten };
}

function sanitizeRelativePath(relativePath: string): string {
    if (typeof relativePath !== "string" || !relativePath.endsWith(".svg")) {
        throw new Error(`Invalid relative path: ${relativePath}`);
    }
    if (relativePath.includes("..") || relativePath.includes("\\") || relativePath.startsWith("/")) {
        throw new Error(`Invalid relative path: ${relativePath}`);
    }
    const segments = relativePath.slice(0, -".svg".length).split("/");
    if (segments.some((segment) => !/^[a-z][a-z0-9_]*$/.test(segment))) {
        throw new Error(`Invalid relative path: ${relativePath}`);
    }
    return segments.join("/") + ".svg";
}
