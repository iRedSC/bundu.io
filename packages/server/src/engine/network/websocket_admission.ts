export type AdmissionConfig = {
    environment?: string;
    allowedOrigins?: readonly string[];
    maxPayloadBytes?: number;
    maxSessionIdLength?: number;
};

export type AdmissionResult =
    | { ok: true; sessionId: string }
    | {
          ok: false;
          status: 400 | 403 | 413;
          reason: "origin_rejected" | "invalid_session" | "payload_too_large";
      };

const SESSION_ID = /^[A-Za-z0-9_-]+$/;

export class WebSocketAdmissionPolicy {
    readonly maxPayloadBytes: number;
    private readonly allowedOrigins: ReadonlySet<string>;
    private readonly allowMissingOrigin: boolean;
    private readonly maxSessionIdLength: number;

    constructor(config: AdmissionConfig = {}) {
        const environment = config.environment ?? process.env.NODE_ENV;
        const local = environment === "development" || environment === "test";
        this.allowedOrigins = new Set(
            config.allowedOrigins ??
                (local
                    ? ["http://localhost:5173", "http://127.0.0.1:5173"]
                    : [])
        );
        this.allowMissingOrigin = local;
        this.maxPayloadBytes = config.maxPayloadBytes ?? 64 * 1024;
        this.maxSessionIdLength = config.maxSessionIdLength ?? 128;
    }

    inspectUpgrade(request: Request, sessionId: string): AdmissionResult {
        const origin = request.headers.get("origin");
        if (
            (!origin && !this.allowMissingOrigin) ||
            (origin && !this.allowedOrigins.has(origin))
        ) {
            return { ok: false, status: 403, reason: "origin_rejected" };
        }
        if (
            sessionId.length < 16 ||
            sessionId.length > this.maxSessionIdLength ||
            !SESSION_ID.test(sessionId)
        ) {
            return { ok: false, status: 400, reason: "invalid_session" };
        }
        return { ok: true, sessionId };
    }

    inspectPayload(
        bytes: number
    ): Extract<AdmissionResult, { ok: false }> | undefined {
        if (bytes <= this.maxPayloadBytes) return;
        return { ok: false, status: 413, reason: "payload_too_large" };
    }
}

export function redactCredential(value: string): string {
    if (value.length < 8) return "[redacted]";
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
