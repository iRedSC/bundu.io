import { Modifiers as CModifiers } from "./base";

export namespace CUtils {
    export class Modifiers {
        /**
         * Clear all modifier values;
         */
        static calc(base: number, type: string, modifiers: CModifiers) {
            const modType = modifiers[type];
            if (modType === undefined) return base;

            const add: number[] = [];
            const multiply: number[] = [];
            for (const modifier of Object.values(modType)) {
                if (modifier.type === "add") {
                    add.push(modifier.value);
                    continue;
                }
                multiply.push(modifier.value);
            }
            for (const value of add) {
                base += value;
            }
            for (const value of multiply) {
                base *= value;
            }
            return base;
        }

        static set(
            type: string,
            name: string,
            op: "add" | "multiply",
            value: number,
            modifiers: CModifiers
        ) {
            if (!modifiers[type]) modifiers[type] = {};
            modifiers[type][name] = { type: op, value };
        }
    }
}
