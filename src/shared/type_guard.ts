import { ZodTypeAny, z } from "zod";

export function validate<T extends ZodTypeAny>(
    data: unknown,
    guard: T
): data is z.infer<T> {
    const parsed = guard.safeParse(data);
    if (parsed.success === true) {
        return true;
    }
    console.error(parsed.error.message);
    return false;
}
