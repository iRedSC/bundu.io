import { round } from "./math.js";
import { BasicPoint } from "./types.js";

/**
 * Returns the distance between two points
 */
export function distance(
    point1: BasicPoint,
    point2: BasicPoint,
    tolerance: number = Number.EPSILON
): number {
    const deltaX = point2.x - point1.x;
    const deltaY = point2.y - point1.y;

    // Check if the difference is within the tolerance
    if (Math.abs(deltaX) < tolerance && Math.abs(deltaY) < tolerance) {
        return 0; // Points are practically identical
    }

    const distance = Math.sqrt(Math.abs(deltaX) ** 2 + Math.abs(deltaY) ** 2);

    return distance;
}

export function rotationLerp(a: number, b: number, t: number): number {
    t = Math.min(1, t);

    let delta = b - a;

    delta = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;

    if (delta > Math.PI) {
        delta -= 2 * Math.PI;
    } else if (delta < -Math.PI) {
        delta += 2 * Math.PI;
    }

    return a + delta * t;
}

/**
 * Converts degrees to radians.
 * @param degrees degrees to convert
 */
export function radians(degrees: number) {
    return (Math.PI / 180) * degrees;
}

/**
 * Converts radians to degrees.
 * @param radians radians to convert
 */
export function degrees(radians: number) {
    return (180 / Math.PI) * radians;
}

export function lookToward(origin: BasicPoint, toward: BasicPoint) {
    let x = toward.x - origin.x;
    let y = toward.y - origin.y;
    return Math.atan2(y, x);
}

export function moveToward(
    current: BasicPoint,
    target: BasicPoint,
    distance: number
): BasicPoint {
    const angle = Math.atan2(target.y - current.y, target.x - current.x);

    return {
        x: current.x + distance * Math.cos(angle),
        y: current.y + distance * Math.sin(angle),
    };
}

export function moveInDirection(
    origin: BasicPoint,
    angle: number,
    distance: number
): BasicPoint {
    return {
        x: origin.x + distance * Math.cos(angle),
        y: origin.y + distance * Math.sin(angle),
    };
}

export function subPoints(a: BasicPoint, b: BasicPoint): BasicPoint {
    return { x: a.x - b.x, y: a.y - b.y };
}

export function clamp(value: number, min: number | null, max: number | null) {
    const clampedMin = min ? Math.max(value, min) : value;
    const clampedMax = max ? Math.min(value, clampedMin) : clampedMin;
    return clampedMax;
}

function hexToRgb(hex: number) {
    const r = (hex >> 16) & 0xff;
    const g = (hex >> 8) & 0xff;
    const b = hex & 0xff;

    return { r, g, b };
}

function rgbToHex(rgb: { r: number; g: number; b: number }) {
    return (rgb.r << 16) + (rgb.g << 8) + rgb.b;
}

export function lerp(a: number, b: number, t: number) {
    t = Math.min(1, t);
    return a * (1 - t) + b * t;
}

export function colorLerp(color1: number, color2: number, t: number) {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);

    const r = Math.round(lerp(rgb1.r, rgb2.r, t));
    const g = Math.round(lerp(rgb1.g, rgb2.g, t));
    const b = Math.round(lerp(rgb1.b, rgb2.b, t));

    return rgbToHex({ r, g, b });
}

type Rectangle = { x: number; y: number; width: number; height: number };

export function coordsToRect(
    x1: number,
    y1: number,
    x2: number,
    y2: number
): Rectangle {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const width = Math.abs(x1 - x2);
    const height = Math.abs(y1 - y2);

    return { x: x, y: y, width: width, height: height };
}

export function prettifyNumber(num: number) {
    let display = `${num}`;
    const prettyMap = {
        [10 ** 3]: "K",
        [10 ** 6]: "M",
        [10 ** 9]: "B",
        [10 ** 12]: "T",
        [10 ** 15]: "Qu",
    };
    for (const [amountStr, symbol] of Object.entries(prettyMap)) {
        const amount = Number(amountStr);
        if (num / amount >= 1) {
            display = `${round(num / amount, 2)}${symbol}`;
        }
    }
    return display;
}
