import { Texture } from "pixi.js";

let softCircle: Texture | undefined;

/** Soft filled circle used for footsteps / land trail debris. */
export function softCircleTexture(size = 32): Texture {
    if (softCircle) return softCircle;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create soft circle texture");

    const center = (size - 1) / 2;
    const radius = size / 2;
    const image = context.createImageData(size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const distance = Math.hypot(x - center, y - center) / radius;
            if (distance >= 1) continue;
            // Soft rim only — keep the core fully opaque so tinted prints read clearly.
            const edge = Math.min(1, (1 - distance) / 0.22);
            const alpha = edge * edge * (3 - 2 * edge);
            const offset = (y * size + x) * 4;
            image.data[offset] = 255;
            image.data[offset + 1] = 255;
            image.data[offset + 2] = 255;
            image.data[offset + 3] = Math.round(alpha * 255);
        }
    }
    context.putImageData(image, 0, 0);
    softCircle = Texture.from(canvas);
    softCircle.source.addressMode = "clamp-to-edge";
    return softCircle;
}
