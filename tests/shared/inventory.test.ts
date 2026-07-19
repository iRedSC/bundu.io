import { describe, expect, test } from "bun:test";
import {
  MAX_STACK,
  PlaceMode,
  amountForMode,
  placeModeFromModifiers,
} from "@bundu/shared/inventory";

describe("amountForMode", () => {
  test("returns 0 for non-positive counts in every mode", () => {
    for (const mode of [PlaceMode.All, PlaceMode.Half, PlaceMode.One]) {
      expect(amountForMode(0, mode)).toBe(0);
      expect(amountForMode(-3, mode)).toBe(0);
    }
  });

  test("One always takes a single item when any exist", () => {
    expect(amountForMode(1, PlaceMode.One)).toBe(1);
    expect(amountForMode(2, PlaceMode.One)).toBe(1);
    expect(amountForMode(9999, PlaceMode.One)).toBe(1);
  });

  test("Half uses ceil semantics for 1–4 and never returns 0 for positive counts", () => {
    expect(amountForMode(1, PlaceMode.Half)).toBe(1);
    expect(amountForMode(2, PlaceMode.Half)).toBe(1);
    expect(amountForMode(3, PlaceMode.Half)).toBe(2);
    expect(amountForMode(4, PlaceMode.Half)).toBe(2);
  });

  test("All returns the full count up to MAX_STACK", () => {
    expect(MAX_STACK).toBe(999);
    expect(amountForMode(1, PlaceMode.All)).toBe(1);
    expect(amountForMode(42, PlaceMode.All)).toBe(42);
    expect(amountForMode(MAX_STACK, PlaceMode.All)).toBe(MAX_STACK);
  });
});

describe("placeModeFromModifiers", () => {
  test("ctrl wins over shift and selects One (wire value 2)", () => {
    expect(PlaceMode.One).toBe(2);
    expect(placeModeFromModifiers(false, true)).toBe(PlaceMode.One);
    expect(placeModeFromModifiers(true, true)).toBe(PlaceMode.One);
  });

  test("shift alone selects Half (wire value 1)", () => {
    expect(PlaceMode.Half).toBe(1);
    expect(placeModeFromModifiers(true, false)).toBe(PlaceMode.Half);
  });

  test("neither modifier selects All (wire value 0)", () => {
    expect(PlaceMode.All).toBe(0);
    expect(placeModeFromModifiers(false, false)).toBe(PlaceMode.All);
  });
});
