import { Serializer } from "./serializer";

export type SerializedPacket = [number, ...unknown[]];

type PacketSchemaEntry = { readonly fields: readonly string[] };
type PacketSchema = Record<number, PacketSchemaEntry>;
type PacketData = object;

type PacketHandler<DataMap extends Record<number, PacketData>, Ctx> = (
    data: DataMap[keyof DataMap & number],
    ctx: Ctx
) => void;

/**
 * Shared deserialize → dispatch → drop-on-error core.
 * Adapters supply batching and map `Ctx` onto their public callback shapes.
 */
export class PacketReceiver<
    S extends PacketSchema,
    DataMap extends Record<number, PacketData>,
    Ctx = void,
> {
    serializer: Serializer<S, DataMap>;
    protected handlers = new Map<
        keyof S & number,
        PacketHandler<DataMap, Ctx>
    >();

    constructor(serializer: Serializer<S, DataMap>) {
        this.serializer = serializer;
    }

    protected setHandler(
        id: keyof S & number,
        handler: PacketHandler<DataMap, Ctx>
    ) {
        this.handlers.set(id, handler);
    }

    protected receivePacket(
        packet: SerializedPacket,
        ctx: Ctx,
        dropMessage: string
    ): void {
        try {
            const id = packet[0] as keyof S & number;
            const data = this.serializer.deserialize(
                packet as Parameters<Serializer<S, DataMap>["deserialize"]>[0]
            );
            this.handlers.get(id)?.(
                data as DataMap[keyof DataMap & number],
                ctx
            );
        } catch (error) {
            console.error(dropMessage, packet, error);
        }
    }
}
