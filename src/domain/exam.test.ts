import { describe, expect, it } from "vitest";
import { formatTime } from "./exam";

describe("formatTime", () => {
  it("formats whole and fractional seconds without leaking decimals", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(2.89137)).toBe("00:02");
    expect(formatTime(65.999)).toBe("01:05");
  });

  it("clamps negative values to zero", () => {
    expect(formatTime(-4.2)).toBe("00:00");
  });
});
