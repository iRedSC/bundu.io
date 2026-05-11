import { file, serve } from "bun";
import path from "path";
import fs from "fs";

const PUBLIC_DIR = path.join(import.meta.dir, "public");
const PORT = Number(process.env.PORT ?? 3000);

serve({
    port: PORT,
    fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/") {
            return Response.redirect(new URL("/site/", url), 302);
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
