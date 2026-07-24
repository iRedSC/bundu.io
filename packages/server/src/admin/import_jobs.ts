export type ImportJobState =
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelled";

type ImportJob = {
    playerId: number;
    state: ImportJobState;
    diagnostic?: string;
    controller: AbortController;
    timer?: ReturnType<typeof setTimeout>;
};

export type MapImportJobsConfig = {
    authorize: (credential: string) => number | undefined;
    run: (
        playerId: number,
        yaml: string,
        signal: AbortSignal
    ) => void | Promise<void>;
    maxPayloadBytes?: number;
    maxConcurrent?: number;
    timeoutMs?: number;
    maxRetainedJobs?: number;
};

function bearerCredential(request: Request): string | undefined {
    const value = request.headers.get("authorization");
    return /^Bearer ([A-Za-z0-9_-]{16,128})$/.exec(value ?? "")?.[1];
}

function boundedDiagnostic(error: unknown): string {
    const message = error instanceof Error ? error.message : "Import failed";
    return message.replace(/[A-Za-z0-9_-]{16,}/g, "[redacted]").slice(0, 240);
}

export class MapImportJobs {
    private readonly jobs = new Map<string, ImportJob>();
    private running = 0;
    private readonly maxPayloadBytes: number;
    private readonly maxConcurrent: number;
    private readonly timeoutMs: number;
    private readonly maxRetainedJobs: number;

    constructor(private readonly config: MapImportJobsConfig) {
        this.maxPayloadBytes = config.maxPayloadBytes ?? 512 * 1024;
        this.timeoutMs = config.timeoutMs ?? 5_000;
        this.maxRetainedJobs = config.maxRetainedJobs ?? 32;
        this.maxConcurrent = Math.min(
            this.maxRetainedJobs,
            config.maxConcurrent ?? 1
        );
    }

    async respond(request: Request, url: URL): Promise<Response | undefined> {
        if (!url.pathname.startsWith("/admin/maps/import")) return;
        const credential = bearerCredential(request);
        const playerId = credential
            ? this.config.authorize(credential)
            : undefined;
        if (playerId === undefined) {
            return Response.json({ error: "unauthorized" }, { status: 401 });
        }

        if (url.pathname === "/admin/maps/import" && request.method === "POST") {
            return this.create(request, playerId);
        }

        const id = url.pathname.slice("/admin/maps/import/".length);
        const job = this.jobs.get(id);
        if (!id || !job || job.playerId !== playerId) {
            return Response.json({ error: "not_found" }, { status: 404 });
        }
        if (request.method === "GET") {
            return Response.json({
                id,
                state: job.state,
                diagnostic: job.diagnostic,
            });
        }
        if (request.method === "DELETE") {
            if (job.state === "queued" || job.state === "running") {
                job.controller.abort();
                this.finish(job, "cancelled");
            }
            return Response.json({ id, state: job.state });
        }
        return new Response("Method Not Allowed", { status: 405 });
    }

    private async create(request: Request, playerId: number): Promise<Response> {
        const declared = Number(request.headers.get("content-length") ?? 0);
        if (declared > this.maxPayloadBytes) {
            return Response.json({ error: "payload_too_large" }, { status: 413 });
        }
        if (this.running >= this.maxConcurrent) {
            return Response.json({ error: "busy" }, { status: 429 });
        }
        this.running++;

        let bytes: Uint8Array;
        try {
            bytes = new Uint8Array(await request.arrayBuffer());
        } catch {
            this.running--;
            return Response.json({ error: "invalid_body" }, { status: 400 });
        }
        if (bytes.byteLength > this.maxPayloadBytes) {
            this.running--;
            return Response.json({ error: "payload_too_large" }, { status: 413 });
        }
        let yaml: string;
        try {
            yaml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
            this.running--;
            return Response.json({ error: "invalid_encoding" }, { status: 400 });
        }

        this.prune();
        const id = crypto.randomUUID();
        const job: ImportJob = {
            playerId,
            state: "queued",
            controller: new AbortController(),
        };
        this.jobs.set(id, job);
        queueMicrotask(() => void this.execute(job, playerId, yaml));
        return Response.json({ id, state: job.state }, { status: 202 });
    }

    private async execute(
        job: ImportJob,
        playerId: number,
        yaml: string
    ): Promise<void> {
        if (job.controller.signal.aborted) {
            this.finish(job, "cancelled");
            return;
        }
        job.state = "running";
        try {
            const timeout = new Promise<never>((_, reject) => {
                job.timer = setTimeout(() => {
                    job.controller.abort();
                    reject(new Error("Import timed out"));
                }, this.timeoutMs);
            });
            await Promise.race([
                this.config.run(playerId, yaml, job.controller.signal),
                timeout,
            ]);
            if (!job.controller.signal.aborted) this.finish(job, "succeeded");
        } catch (error) {
            this.finish(
                job,
                job.controller.signal.aborted ? "cancelled" : "failed",
                boundedDiagnostic(error)
            );
        }
    }

    private finish(
        job: ImportJob,
        state: ImportJobState,
        message?: string
    ): void {
        if (job.timer) clearTimeout(job.timer);
        if (job.state === "queued" || job.state === "running") this.running--;
        job.state = state;
        job.diagnostic = message;
    }

    private prune(): void {
        while (this.jobs.size >= this.maxRetainedJobs) {
            const oldest = this.jobs.entries().next().value as
                | [string, ImportJob]
                | undefined;
            if (!oldest) return;
            if (oldest[1].state === "queued" || oldest[1].state === "running") {
                return;
            }
            this.jobs.delete(oldest[0]);
        }
    }
}
