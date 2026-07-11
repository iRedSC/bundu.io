import type { ColorSource } from "pixi.js";
import { colorLerp, lerp, radians } from "@bundu/shared/transforms";
import { random } from "@bundu/shared";
import { Animation } from "../animation/runtime";
import { easeIn, easeOut } from "../animation/animations";
import type { AnimContext, PartNode, SizeTarget } from "./types";

type Tintable = { tint: ColorSource };

/** Tint flash on part visuals. */
export function hurt(nodes: PartNode[]) {
    const targets: Tintable[] = nodes.map((n) => n.visual);
    const animation = new Animation();
    let tints: ColorSource[] = [];

    animation.keyframes[0] = (a) => {
        if (a.isFirstKeyframe) {
            tints = targets.map((t) => t.tint);
            a.goto(0, 100);
        }
        for (const [i, target] of targets.entries()) {
            target.tint = colorLerp(Number(tints[i]), 0xff0000, a.t);
        }
        if (a.keyframeEnded) a.next(400);
    };

    animation.keyframes[1] = (a) => {
        for (const target of targets) {
            target.tint = colorLerp(0xff0000, 0xffffff, a.t);
        }
        if (a.keyframeEnded) a.expired = true;
    };

    return animation;
}

/** Scale punch on a GameObject-like `{ size }` (structure parity). */
export function hitSize(target: SizeTarget) {
    const scale = target.size;
    const animation = new Animation();

    animation.keyframes[0] = (a) => {
        if (a.isFirstKeyframe) a.goto(0, 100);
        const t = easeOut(a.t);
        target.size = lerp(scale, scale / 1.1, t);
        if (a.keyframeEnded) a.next(400);
    };

    animation.keyframes[1] = (a) => {
        const t = easeOut(a.t);
        target.size = lerp(scale / 1.1, scale, t);
        if (a.keyframeEnded) a.expired = true;
    };

    animation.cleanup = () => {
        target.size = scale;
    };
    return animation;
}

/** Scale punch on the first part's root. */
export function hit(node: PartNode) {
    const target = node.root;
    const base = target.scale.x;
    const animation = new Animation();

    animation.keyframes[0] = (a) => {
        if (a.isFirstKeyframe) a.goto(0, 100);
        const t = easeOut(a.t);
        const s = lerp(base, base / 1.1, t);
        target.scale.set(s);
        if (a.keyframeEnded) a.next(400);
    };

    animation.keyframes[1] = (a) => {
        const t = easeOut(a.t);
        const s = lerp(base / 1.1, base, t);
        target.scale.set(s);
        if (a.keyframeEnded) a.expired = true;
    };

    animation.cleanup = () => target.scale.set(base);
    return animation;
}

const WAVE = 0.01;

/**
 * Idle sway: parts[0]/parts[1] opposite X, parts[2+] Y.
 * Matches current player idleHands when given leftHand, rightHand, body.
 */
export function wave(nodes: PartNode[]) {
    const bases = nodes.map((n) => ({ x: n.root.x, y: n.root.y }));
    const animation = new Animation();

    animation.keyframes[0] = (a) => {
        if (a.isFirstKeyframe) a.goto(0, 2000);
        const c = Math.cos(a.t * Math.PI * 2) * WAVE;
        const s = Math.sin(a.t * Math.PI * 2) * WAVE;

        const left = nodes[0];
        const right = nodes[1];
        const leftBase = bases[0];
        const rightBase = bases[1];
        if (left && leftBase) left.root.x = leftBase.x + c;
        if (right && rightBase) right.root.x = rightBase.x - c;
        for (let i = 2; i < nodes.length; i++) {
            const node = nodes[i];
            const base = bases[i];
            if (node && base) node.root.y = base.y + s;
        }

        if (a.keyframeEnded) a.goto(0, random.integer(1500, 2500));
    };

    return animation;
}

/** Continuous Z rotation on the first part. */
export function spin(nodes: PartNode[], rpm = 20) {
    const target = nodes[0]?.root;
    if (!target) return new Animation();

    const animation = new Animation();
    let last = 0;
    animation.keyframes[0] = (a) => {
        if (a.isFirstKeyframe) {
            last = Date.now();
            a.goto(0, 1000);
        }
        const now = Date.now();
        target.rotation += ((now - last) / 1000) * ((rpm * Math.PI * 2) / 60);
        last = now;
        if (a.keyframeEnded) a.goto(0, 1000);
    };
    return animation;
}

/** Light alpha flicker on part visuals (campfire flame). */
export function flicker(nodes: PartNode[]) {
    const visuals = nodes.map((n) => n.visual);
    const animation = new Animation();

    animation.keyframes[0] = (a) => {
        if (a.isFirstKeyframe) a.goto(0, 120);
        const pulse = 0.75 + 0.25 * Math.sin(a.t * Math.PI);
        for (const v of visuals) v.alpha = pulse;
        if (a.keyframeEnded) a.goto(0, random.integer(80, 160));
    };

    return animation;
}

function limbRoots(nodes: PartNode[]) {
    const left = nodes[0]?.root;
    const right = nodes[1]?.root;
    const body = nodes[2]?.root;
    if (!left || !right || !body) {
        throw new Error("attack/block presets need parts: [leftHand, rightHand, body]");
    }
    return { left, right, body };
}

/** Player attack swing. Expects parts [leftHand, rightHand, body]. */
export function attack(nodes: PartNode[], ctx: AnimContext) {
    const { left, right, body } = limbRoots(nodes);
    let targetHand = 0;
    const animation = new Animation();

    animation.keyframes[0] = (a) => {
        if (ctx.blocking) return;
        targetHand = !(ctx.mainhand === "" && ctx.offhand === "")
            ? 1
            : random.integer(0, 1);
        if (left.rotation !== 0) {
            left.rotation = 0;
            right.rotation = 0;
        }
        a.next(125);
    };

    animation.keyframes[1] = (a) => {
        const t = easeOut(a.t);
        if (targetHand) {
            left.rotation = lerp(radians(0), radians(-100), t);
            right.rotation = lerp(radians(0), radians(-10), t);
            body.rotation = lerp(radians(0), radians(-25), t);
        } else {
            right.rotation = lerp(radians(0), radians(100), t);
            left.rotation = lerp(radians(0), radians(10), t);
            body.rotation = lerp(radians(0), radians(25), t);
        }
        if (a.keyframeEnded) a.next(275);
    };

    animation.keyframes[2] = (a) => {
        const t = easeIn(a.t);
        if (targetHand) {
            left.rotation = lerp(radians(-100), radians(0), t);
            right.rotation = lerp(radians(-10), radians(0), t);
            body.rotation = lerp(radians(-25), radians(0), t);
        } else {
            right.rotation = lerp(radians(100), radians(0), t);
            left.rotation = lerp(radians(10), radians(0), t);
            body.rotation = lerp(radians(25), radians(0), t);
        }
        if (a.keyframeEnded) a.expired = true;
    };

    animation.cleanup = () => {
        left.rotation = 0;
        right.rotation = 0;
        body.rotation = 0;
    };

    return animation;
}

/** Player block pose. Expects parts [leftHand, rightHand, body]. */
export function block(nodes: PartNode[], ctx: AnimContext) {
    const { left, right, body } = limbRoots(nodes);
    let bodyRot = 0;
    let leftRot = 0;
    let rightRot = 0;
    const animation = new Animation();

    animation.keyframes[0] = (a) => {
        bodyRot = body.rotation;
        leftRot = left.rotation;
        rightRot = right.rotation;
        a.next(75);
    };

    animation.keyframes[1] = (a) => {
        left.rotation = lerp(leftRot, radians(-90), a.t);
        right.rotation = lerp(rightRot, radians(45), a.t);
        body.rotation = lerp(bodyRot, radians(15), a.t);
        if (!ctx.blocking) a.next(60);
    };

    animation.keyframes[2] = (a) => {
        left.rotation = lerp(radians(-90), radians(0), a.t);
        right.rotation = lerp(radians(45), radians(0), a.t);
        body.rotation = lerp(radians(15), radians(0), a.t);
        if (a.keyframeEnded) a.expired = true;
    };

    animation.cleanup = () => {
        left.rotation = leftRot;
        right.rotation = rightRot;
        body.rotation = bodyRot;
    };

    return animation;
}

/** Resolve a preset name to an Animation. */
export function createPreset(
    name: string,
    nodes: PartNode[],
    ctx: AnimContext,
    sizeTarget?: SizeTarget
): Animation {
    switch (name) {
        case "hurt":
            return hurt(nodes);
        case "hit":
            return sizeTarget ? hitSize(sizeTarget) : hit(nodes[0]!);
        case "wave":
            return wave(nodes);
        case "spin":
            return spin(nodes);
        case "flicker":
            return flicker(nodes);
        case "attack":
            return attack(nodes, ctx);
        case "block":
            return block(nodes, ctx);
        default:
            throw new Error(`Unknown anim preset: ${name}`);
    }
}
