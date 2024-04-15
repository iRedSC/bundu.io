import { ZodTypeAny } from "zod";
import Logger from "js-logger";

const logger = Logger.get("Packet");

type Parser = (data: unknown[], ...args: unknown[]) => void;

export class PacketParser {
    parsers: { [key: number]: Parser };
    callbacks: { [key: number]: Function };

    constructor() {
        this.parsers = {};
        this.callbacks = {};
    }

    unpack(packet: unknown, ...data: any[]) {
        // find packet id
        if (!(packet instanceof Array)) {
            logger.error(`Packet ${packet} is not an array.`);
            return;
        }

        const id = packet[0];
        if (typeof id !== "number") {
            return;
        }

        // find unpacker linked to packet id
        const parser = this.parsers[id];
        if (!parser) {
            return;
        }
        // feed packet data to unpacker
        parser(packet.slice(1), ...data);
    }

    set(id: number, guard: ZodTypeAny, callback?: Function) {
        if (callback === undefined) {
            callback = this.callbacks[id];
        } else {
            this.callbacks[id] = callback;
        }
        function parser(data: unknown[], ...args: unknown[]) {
            const packet = data[0];

            if (!packet) {
                return;
            }
            const parsedPacket = guard.safeParse(packet);

            if (parsedPacket.success === true) {
                if (callback) {
                    callback(packet, ...args);
                }
            } else {
                console.error(packet);
                console.error(parsedPacket.error.message);
            }
            if (data.length > 0) {
                parser(data.slice(1), ...args);
            }
        }
        this.parsers[id] = parser;
    }
}
