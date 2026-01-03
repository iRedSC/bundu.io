import { file, serve } from "bun";
import path from "path";
import fs from "fs";

const PUBLIC_DIR = path.join(import.meta.dir, "public");

serve({
    port: 3000,
    fetch(req) {
        const url = new URL(req.url);
        let pathname = url.pathname === "/" ? "/index.html" : url.pathname;
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
