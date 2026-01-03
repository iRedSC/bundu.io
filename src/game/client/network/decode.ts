import { decode, decodeAsync } from "@msgpack/msgpack";

export async function decodeFromBlob(blob: Blob) {
    if (blob.stream) {
        // Blob#stream(): ReadableStream<Uint8Array> (recommended)
        return await decodeAsync(blob.stream());
    } else {
        // Blob#arrayBuffer(): Promise<ArrayBuffer> (if stream() is not available)
        return decode(await blob.arrayBuffer());
    }
}
