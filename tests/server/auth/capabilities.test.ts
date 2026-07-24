import { describe, expect, test } from "bun:test";
import {
  assertProductionDebugPolicy,
  canUseCapability,
} from "../../../packages/server/src/auth/capabilities";
import { PlayerData } from "../../../packages/server/src/components/player";
import { GameObject } from "../../../packages/server/src/engine";

class TestPlayer extends GameObject {}

function player(overrides: Partial<PlayerData> = {}): GameObject {
  const data = new PlayerData();
  Object.assign(data.data, { clientReady: true }, overrides);
  return new TestPlayer().add(data);
}

describe("capability authorization", () => {
  test("rejects privileged capabilities without operator authority", () => {
    const subject = player();
    expect(canUseCapability(subject, "gameplay")).toBeTrue();
    expect(canUseCapability(subject, "creative")).toBeFalse();
    expect(canUseCapability(subject, "admin")).toBeFalse();
    expect(canUseCapability(subject, "debug")).toBeFalse();
  });

  test("keeps admin narrower than creative and debug", () => {
    const subject = player({ opLevel: 4 });
    expect(canUseCapability(subject, "creative")).toBeTrue();
    expect(canUseCapability(subject, "debug")).toBeTrue();
    expect(canUseCapability(subject, "admin")).toBeFalse();

    subject.get(PlayerData).freecam = true;
    expect(canUseCapability(subject, "admin")).toBeTrue();
    expect(canUseCapability(subject, "gameplay")).toBeFalse();
  });

  test("production refuses debug and phrase elevation", () => {
    expect(() => assertProductionDebugPolicy({
      NODE_ENV: "production",
      BUNDU_DEBUG: "1",
    })).toThrow("forbidden in production");
    expect(() => assertProductionDebugPolicy({
      NODE_ENV: "production",
      BUNDU_CHEAT_PHRASE: "secret-value",
    })).toThrow("forbidden in production");
    expect(() => assertProductionDebugPolicy({
      NODE_ENV: "production",
    })).not.toThrow();
  });
});
