interface Point {
    x: number;
    y: number;
    [key: string]: any;
}
export function rotationLerp(a: number, b: number, t: number): number {
    let delta = b - a;
    if (delta > Math.PI) {
        b -= 2 * Math.PI;
    } else if (delta < -Math.PI) {
        b += 2 * Math.PI;
    }

    return a + (b - a) * t;
}

export function degrees(degrees: number) {
    return (Math.PI / 180) * degrees;
}

export function lookToward(origin: Point, toward: Point) {
    let x = toward.x - origin.x;
    let y = toward.y - origin.y;
    return Math.atan2(y, x);
}

export function moveToward(
    origin: Point,
    angle: number,
    distance: number
): Point {
    return {
        x: origin.x + distance * Math.cos(angle),
        y: origin.y + distance * Math.sin(angle),
    };
}

export function subPoints(a: Point, b: Point): Point {
    return { x: a.x - b.x, y: a.y - b.y };
}

export function moveForward(
    point: Point,
    direction: number,
    distance: number
): Point {
    let newX = point.x + distance * Math.cos(direction);
    let newY = point.y + distance * Math.sin(direction);
    return { x: newX, y: newY };
}

export function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
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
