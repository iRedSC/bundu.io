import { PLAYER_MOVE_SPEED, SERVER_TICK_MS } from "@bundu/shared";
import { serverTime } from "@client/globals";
import { movementProbe } from "../world/movement_probe";

/** Expected visual speed while walking (world units / ms). */
const EXPECTED_SPEED = PLAYER_MOVE_SPEED / SERVER_TICK_MS;

const FRAME_HISTORY = 180;
const EVENT_HISTORY = 20;

/** Displacement this small counts as "stopped" for a frame. */
const STALL_SPEED = 0.04; // u/ms
/** Was moving at least this fast before a stall. */
const WAS_MOVING = 0.12; // u/ms
/** Spike if instantaneous speed exceeds expected by this factor. */
const SPIKE_FACTOR = 2.8;
/** Soft hitch: speed drops sharply but not to zero (pad/wobble class). */
const DIP_RATIO = 0.55;
/** Soft hitch: frame-to-frame speed change while still moving. */
const JERK_DELTA = EXPECTED_SPEED * 0.7;
/** Browser/render hitch if frame dt exceeds this. */
const FRAME_GAP_MS = 40;

export type HitchKind = "stall" | "spike" | "frame_gap" | "dip" | "jerk" | "reverse";

/** Likely cause tag derived from probe state at hitch time. */
export type HitchCause =
    | "held" // lerp already finished (waiting on next SetPosition)
    | "burst" // serverDt was tiny → step completed in one frame
    | "catchup" // large old→target span
    | "multi_set" // >1 SetPosition this frame
    | "extrap" // correction after coasting past target
    | "frame" // long frame
    | "?";

export type FrameSample = {
    t: number;
    dt: number;
    x: number;
    y: number;
    dist: number;
    speed: number;
    serverDt: number;
    sincePos: number;
    lerpT: number;
    held: boolean;
    span: number;
    sets: number;
    hitch?: HitchKind;
    cause?: HitchCause;
};

export type HitchEvent = {
    t: number;
    kind: HitchKind;
    cause: HitchCause;
    detail: string;
    speed: number;
    prevSpeed: number;
    dt: number;
    dist: number;
    serverDt: number;
    serverDtAtSet: number;
    sincePos: number;
    lerpT: number;
    span: number;
    sets: number;
};

const WATCHER_CSS = `
.movement-watcher {
    position: absolute;
    left: 0.75rem;
    bottom: 0.75rem;
    z-index: 4;
    width: 26rem;
    padding: 0.55rem 0.65rem 0.6rem;
    border-radius: 0.35rem;
    background: rgba(8, 12, 10, 0.88);
    border: 1px solid rgba(242, 240, 228, 0.14);
    color: #e8e6d9;
    font-family: ui-monospace, "Cascadia Code", "SF Mono", Menlo, monospace;
    font-size: 11px;
    line-height: 1.35;
    pointer-events: none;
    user-select: none;
}
.movement-watcher[data-active="false"] {
    display: none;
}
.mw-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.35rem;
    color: rgba(232, 230, 217, 0.7);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: 10px;
}
.mw-head strong {
    color: #e8e6d9;
    font-weight: 600;
}
.mw-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.15rem 0.75rem;
    margin-bottom: 0.4rem;
}
.mw-stats span {
    color: rgba(232, 230, 217, 0.55);
}
.mw-stats b {
    color: #e8e6d9;
    font-weight: 500;
}
.mw-canvas {
    display: block;
    width: 100%;
    height: 52px;
    margin-bottom: 0.4rem;
    image-rendering: pixelated;
    background: rgba(0, 0, 0, 0.35);
    border-radius: 0.2rem;
}
.mw-events {
    max-height: 11rem;
    overflow: hidden;
    border-top: 1px solid rgba(242, 240, 228, 0.1);
    padding-top: 0.35rem;
}
.mw-event {
    padding: 0.2rem 0;
    border-bottom: 1px solid rgba(242, 240, 228, 0.06);
}
.mw-event:last-child {
    border-bottom: none;
}
.mw-event-top {
    display: grid;
    grid-template-columns: 4.6rem 4.2rem 3.4rem 1fr;
    gap: 0.3rem;
}
.mw-event-sub {
    color: rgba(232, 230, 217, 0.5);
    padding-left: 4.6rem;
    font-size: 10px;
}
.mw-kind {
    font-weight: 600;
}
.mw-kind[data-kind="stall"] { color: #f0a020; }
.mw-kind[data-kind="spike"] { color: #e85d5d; }
.mw-kind[data-kind="frame_gap"] { color: #6cb6ff; }
.mw-kind[data-kind="dip"] { color: #e0c060; }
.mw-kind[data-kind="jerk"] { color: #c090e0; }
.mw-kind[data-kind="reverse"] { color: #e070a0; }
.mw-cause {
    color: rgba(232, 230, 217, 0.75);
}
.mw-empty {
    color: rgba(232, 230, 217, 0.4);
    font-style: italic;
}
`;

function fmtMs(t: number): string {
    const d = new Date(t);
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    return `${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}.${ms}`;
}

function fmt(n: number, digits = 2): string {
    return n.toFixed(digits);
}

function classifyCause(
    kind: HitchKind,
    opts: {
        held: boolean;
        extrapolating: boolean;
        serverDt: number;
        span: number;
        sets: number;
    }
): HitchCause {
    if (kind === "frame_gap") return "frame";
    if (opts.sets > 1) return "multi_set";
    if (opts.extrapolating || (opts.sets > 0 && opts.held === false && kind === "jerk")) {
        // Packet landed during/after coast — common soft hitch source.
        if (opts.sets > 0) return "extrap";
    }
    if (opts.serverDt > 0 && opts.serverDt < SERVER_TICK_MS * 0.45) return "burst";
    if (opts.span > PLAYER_MOVE_SPEED * 2.1) return "catchup";
    if (kind === "stall" && opts.held) return "held";
    if (opts.held) return "held";
    if (opts.sets > 0) return "extrap";
    return "?";
}

/**
 * Samples local-player rendered position every frame and flags stalls,
 * speed spikes, and long frame gaps. Debug-only HUD.
 */
export class MovementWatcher {
    readonly frames: FrameSample[] = [];
    readonly events: HitchEvent[] = [];

    private active = false;
    private lastT = 0;
    private lastX = 0;
    private lastY = 0;
    private lastDx = 0;
    private lastDy = 0;
    private hasSample = false;
    private hitchCount = 0;

    private root: HTMLElement;
    private statsEl: HTMLElement;
    private eventsEl: HTMLElement;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;

    constructor() {
        if (!document.querySelector("style[data-bundu-movement-watcher]")) {
            const style = document.createElement("style");
            style.setAttribute("data-bundu-movement-watcher", "1");
            style.textContent = WATCHER_CSS;
            document.head.appendChild(style);
        }

        this.root = document.createElement("aside");
        this.root.className = "movement-watcher";
        this.root.dataset.active = "false";
        this.root.setAttribute("aria-label", "Movement hitch watcher");
        this.root.innerHTML = `
            <div class="mw-head">
                <strong>Movement watch</strong>
                <span class="mw-count">0 hitches</span>
            </div>
            <div class="mw-stats"></div>
            <canvas class="mw-canvas" width="400" height="52"></canvas>
            <div class="mw-events"><div class="mw-empty">Walk around — anomalies show up here.</div></div>
        `;
        document.body.appendChild(this.root);

        this.statsEl = this.root.querySelector(".mw-stats")!;
        this.eventsEl = this.root.querySelector(".mw-events")!;
        this.canvas = this.root.querySelector("canvas")!;
        this.ctx = this.canvas.getContext("2d")!;

        (
            globalThis as unknown as { __movementWatcher?: MovementWatcher }
        ).__movementWatcher = this;
    }

    setActive(active: boolean) {
        this.active = active;
        this.root.dataset.active = String(active);
        if (!active) {
            this.reset();
            return;
        }
        this.render();
    }

    isActive() {
        return this.active;
    }

    reset() {
        this.frames.length = 0;
        this.events.length = 0;
        this.hasSample = false;
        this.lastT = 0;
        this.hitchCount = 0;
        this.render();
    }

    /**
     * Call once per client tick with the local player's *rendered* position.
     * Pass `null` when there is no local player.
     */
    sample(pos: { x: number; y: number } | null, playerId = -1) {
        if (!this.active) return;
        if (playerId >= 0) movementProbe.watch(playerId);
        if (!pos) return;

        const t = performance.now();
        if (!this.hasSample) {
            this.hasSample = true;
            this.lastT = t;
            this.lastX = pos.x;
            this.lastY = pos.y;
            movementProbe.beginFrame();
            return;
        }

        const dt = t - this.lastT;
        if (dt <= 0) return;

        const dx = pos.x - this.lastX;
        const dy = pos.y - this.lastY;
        const dist = Math.hypot(dx, dy);
        const speed = dist / dt;
        const prev = this.frames[this.frames.length - 1];
        const prevSpeed = prev?.speed ?? 0;

        const sincePos =
            movementProbe.lastPosAt > 0 ? t - movementProbe.lastPosAt : -1;
        const lerpT = movementProbe.lerpT;
        const held = movementProbe.held;
        const extrapolating = movementProbe.extrapolating;
        const span = movementProbe.lastSpan;
        const sets = movementProbe.posSetsThisFrame;
        const serverDt = serverTime.serverDt;

        let hitch: HitchKind | undefined;
        let detail = "";

        if (dt >= FRAME_GAP_MS) {
            hitch = "frame_gap";
            detail = `frame ${fmt(dt, 1)}ms`;
        } else if (
            prevSpeed >= WAS_MOVING &&
            speed <= STALL_SPEED &&
            dt < FRAME_GAP_MS
        ) {
            hitch = "stall";
            detail = `${fmt(prevSpeed * 1000, 0)}→${fmt(speed * 1000, 0)} u/s`;
        } else if (speed > EXPECTED_SPEED * SPIKE_FACTOR && dist > 1) {
            hitch = "spike";
            detail = `Δ${fmt(dist, 1)}u @ ${fmt(speed * 1000, 0)} u/s`;
        } else if (
            prevSpeed >= WAS_MOVING &&
            speed > STALL_SPEED &&
            speed <= prevSpeed * DIP_RATIO
        ) {
            hitch = "dip";
            detail = `${fmt(prevSpeed * 1000, 0)}→${fmt(speed * 1000, 0)} u/s`;
        } else if (
            dist > 0.4 &&
            prev !== undefined &&
            prev.dist > 0.4 &&
            dx * this.lastDx + dy * this.lastDy < 0
        ) {
            hitch = "reverse";
            detail = `dir flip @ ${fmt(speed * 1000, 0)} u/s`;
        } else if (
            prevSpeed >= WAS_MOVING &&
            speed >= WAS_MOVING &&
            Math.abs(speed - prevSpeed) >= JERK_DELTA
        ) {
            hitch = "jerk";
            detail = `${fmt(prevSpeed * 1000, 0)}→${fmt(speed * 1000, 0)} u/s`;
        }

        const cause = hitch
            ? classifyCause(hitch, {
                  held,
                  extrapolating,
                  serverDt,
                  span,
                  sets,
              })
            : undefined;

        const frame: FrameSample = {
            t,
            dt,
            x: pos.x,
            y: pos.y,
            dist,
            speed,
            serverDt,
            sincePos,
            lerpT,
            held,
            span,
            sets,
            hitch,
            cause,
        };
        this.frames.push(frame);
        if (this.frames.length > FRAME_HISTORY) this.frames.shift();

        if (hitch && cause) {
            this.hitchCount += 1;
            const event: HitchEvent = {
                t: Date.now(),
                kind: hitch,
                cause,
                detail,
                speed,
                prevSpeed,
                dt,
                dist,
                serverDt,
                serverDtAtSet: movementProbe.serverDtAtSet,
                sincePos,
                lerpT,
                span,
                sets,
            };
            this.events.unshift(event);
            if (this.events.length > EVENT_HISTORY) this.events.pop();
            console.warn(
                `[movement] ${hitch}/${cause} ${detail} | dt=${fmt(dt, 1)}ms sDt=${fmt(serverDt, 1)}ms @set=${fmt(movementProbe.serverDtAtSet, 1)}ms sincePos=${fmt(sincePos, 1)}ms t=${fmt(lerpT, 2)} span=${fmt(span, 1)} sets=${sets} extrap=${extrapolating}`
            );
        }

        this.lastT = t;
        this.lastX = pos.x;
        this.lastY = pos.y;
        this.lastDx = dx;
        this.lastDy = dy;
        movementProbe.beginFrame();
        this.render();
    }

    private render() {
        const count = this.root.querySelector(".mw-count");
        if (count) count.textContent = `${this.hitchCount} hitches`;

        const latest = this.frames[this.frames.length - 1];
        const speedU = latest ? latest.speed * 1000 : 0;
        const expectedU = EXPECTED_SPEED * 1000;

        this.statsEl.innerHTML = `
            <div><span>speed</span> <b>${fmt(speedU, 0)}</b> u/s <span>(exp ~${fmt(expectedU, 0)})</span></div>
            <div><span>frame dt</span> <b>${fmt(latest?.dt ?? 0, 1)}</b> ms</div>
            <div><span>serverDt</span> <b>${fmt(serverTime.serverDt, 1)}</b> ms</div>
            <div><span>sincePos</span> <b>${fmt(latest?.sincePos ?? 0, 0)}</b> ms</div>
            <div><span>lerp t</span> <b>${fmt(latest?.lerpT ?? 0, 2)}</b> ${
                movementProbe.extrapolating
                    ? "<span>EXTRAP</span>"
                    : latest?.held
                      ? "<span>HELD</span>"
                      : ""
            }</div>
            <div><span>span</span> <b>${fmt(latest?.span ?? 0, 1)}</b> u</div>
        `;

        this.drawSparkline();

        if (this.events.length === 0) {
            this.eventsEl.innerHTML =
                '<div class="mw-empty">Walk around — anomalies show up here.</div>';
            return;
        }

        this.eventsEl.innerHTML = this.events
            .map(
                (e) => `
            <div class="mw-event">
                <div class="mw-event-top">
                    <span>${fmtMs(e.t)}</span>
                    <span class="mw-kind" data-kind="${e.kind}">${e.kind}</span>
                    <span class="mw-cause">${e.cause}</span>
                    <span>${e.detail}</span>
                </div>
                <div class="mw-event-sub">
                    sDt ${fmt(e.serverDt, 1)} · @set ${fmt(e.serverDtAtSet, 1)} · sincePos ${fmt(e.sincePos, 0)} · t ${fmt(e.lerpT, 2)} · span ${fmt(e.span, 1)} · sets ${e.sets}
                </div>
            </div>`
            )
            .join("");
    }

    private drawSparkline() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);

        const maxSpeed = EXPECTED_SPEED * SPIKE_FACTOR * 1.2;
        const expectedY = h - (EXPECTED_SPEED / maxSpeed) * (h - 4) - 2;

        ctx.strokeStyle = "rgba(232, 230, 217, 0.2)";
        ctx.beginPath();
        ctx.moveTo(0, expectedY);
        ctx.lineTo(w, expectedY);
        ctx.stroke();

        if (this.frames.length < 2) return;

        const n = this.frames.length;
        const step = w / Math.max(FRAME_HISTORY - 1, 1);

        ctx.strokeStyle = "rgba(120, 200, 140, 0.9)";
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const f = this.frames[i]!;
            const x = (FRAME_HISTORY - n + i) * step;
            const y =
                h - (Math.min(f.speed, maxSpeed) / maxSpeed) * (h - 4) - 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();

        for (let i = 0; i < n; i++) {
            const f = this.frames[i]!;
            if (!f.hitch) continue;
            const x = (FRAME_HISTORY - n + i) * step;
            ctx.fillStyle =
                f.hitch === "stall" || f.hitch === "dip"
                    ? "#f0a020"
                    : f.hitch === "spike"
                      ? "#e85d5d"
                      : f.hitch === "jerk" || f.hitch === "reverse"
                        ? "#c090e0"
                        : "#6cb6ff";
            ctx.fillRect(x - 1, 0, 2, h);
        }
    }
}
