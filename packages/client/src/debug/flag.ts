/** Build injects this via Bun `define`. Default true for unbundled local runs. */
declare const __DEBUG__: boolean;

export const DEBUG: boolean =
    typeof __DEBUG__ === "boolean" ? __DEBUG__ : true;
