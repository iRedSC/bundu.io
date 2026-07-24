import { choice } from "./random";

/** Matches the menu `#name-input` maxlength. */
export const MAX_USERNAME_LENGTH = 24;

const ADJECTIVES = [
    "Swift",
    "Brave",
    "Quiet",
    "Lucky",
    "Clever",
    "Mighty",
    "Gentle",
    "Wild",
    "Sunny",
    "Rusty",
    "Dusty",
    "Frosty",
    "Sneaky",
    "Jolly",
    "Nimble",
    "Bold",
    "Calm",
    "Keen",
    "Proud",
    "Rapid",
] as const;

const NOUNS = [
    "Fox",
    "Wolf",
    "Hawk",
    "Bear",
    "Otter",
    "Raven",
    "Tiger",
    "Panda",
    "Crab",
    "Moth",
    "Fern",
    "Oak",
    "Stone",
    "River",
    "Storm",
    "Ember",
    "Spark",
    "Leaf",
    "Coral",
    "Finch",
] as const;

/** Random `AdjectiveNoun` display name (fits within {@link MAX_USERNAME_LENGTH}). */
export function generateUsername(): string {
    return `${choice([...ADJECTIVES])}${choice([...NOUNS])}`;
}

/** Trim and clamp; empty input becomes a generated `AdjectiveNoun`. */
export function resolveUsername(raw: string | null | undefined): string {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) return generateUsername();
    return trimmed.slice(0, MAX_USERNAME_LENGTH);
}

/** Append `n` to `base`, truncating the base so the result fits maxlength. */
export function usernameWithSuffix(base: string, n: number): string {
    const suffix = String(n);
    return base.slice(0, MAX_USERNAME_LENGTH - suffix.length) + suffix;
}

export function usernamesEqual(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase();
}
