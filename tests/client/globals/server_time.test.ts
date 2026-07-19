import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { clientTime } from "@client/globals";

describe("clientTime", () => {
  afterEach(() => {
    mock.restore();
    clientTime.resetServerSync();
  });

  test("uses server timestamps unchanged until synchronized", () => {
    expect(clientTime.fromServer(250)).toBe(250);
  });

  test("converts server timestamps using the first measured offset", () => {
    const now = spyOn(clientTime, "now").mockReturnValue(1_000);

    clientTime.synchronize(700);
    expect(clientTime.fromServer(750)).toBe(1_050);

    now.mockReturnValue(5_000);
    clientTime.synchronize(100);
    expect(clientTime.fromServer(750)).toBe(1_050);
  });

  test("resetServerSync allows a new connection to establish a fresh offset", () => {
    const now = spyOn(clientTime, "now").mockReturnValue(1_000);
    clientTime.synchronize(800);

    clientTime.resetServerSync();
    now.mockReturnValue(2_000);
    clientTime.synchronize(500);

    expect(clientTime.fromServer(600)).toBe(2_100);
  });
});
