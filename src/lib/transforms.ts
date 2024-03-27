type Point = {
    x: number;
    y: number;
    [key: string]: any;
};

export function distance(point1: Point, point2: Point): number {
    const deltaX = point2.x - point1.x;
    const deltaY = point2.y - point1.y;

    const distance = Math.sqrt(deltaX ** 2 + deltaY ** 2);

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

export function degrees(degrees: number) {
    return (Math.PI / 180) * degrees;
}

export function lookToward(origin: Point, toward: Point) {
    let x = toward.x - origin.x;
    let y = toward.y - origin.y;
    return Math.atan2(y, x);
}

export function moveToward(
    current: Point,
    target: Point,
    distance: number
): Point {
    const angle = Math.atan2(target.y - current.y, target.x - current.x);

    return {
        x: current.x + distance * Math.cos(angle),
        y: current.y + distance * Math.sin(angle),
    };
}

export function moveInDirection(
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
