import { describe, expect, it } from "vitest";
import { formatMinutesAndSeconds, formatTime } from "./time";

describe("formatTime", () => {
  it("formats whole and fractional seconds without leaking decimals", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(2.89137)).toBe("00:02");
    expect(formatTime(65.999)).toBe("01:05");
  });

  it("clamps negative values to zero", () => {
    expect(formatTime(-4.2)).toBe("00:00");
  });

  it("keeps durations longer than an hour in minutes", () => {
    expect(formatTime(3600)).toBe("60:00");
  });
});

describe("formatMinutesAndSeconds", () => {
  it("retains fractional seconds for callers that do not round", () => {
    expect(formatMinutesAndSeconds(65.5)).toBe("01:5.5");
    expect(formatMinutesAndSeconds(0)).toBe("00:00");
  });

  it("allows the speaking display to omit minute padding", () => {
    expect(formatMinutesAndSeconds(65, 1)).toBe("1:05");
    expect(formatMinutesAndSeconds(2.5, 1)).toBe("0:2.5");
  });
});
