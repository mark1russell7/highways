import { describe, expect, it } from "vitest";
import { noiseCounts, type NoiseRow } from "./sections-gate-noise.ts";

const row = (run: string, attempt: number, spread: number): NoiseRow => ({ run, date: "", attempt, spread, cpu: "" });

describe("the counts of a read of the gate noise", () => {
  it("states each count with its denominator", () => {
    const rows = [row("a", 1, 0.01), row("b", 1, 0.07), row("b", 2, 0.01), row("c", 1, 0.07), row("c", 2, 0.07)];
    expect(noiseCounts(rows, 0.05)).toEqual({ records: { over: 3, of: 5 }, firstAttempts: { over: 2, of: 3 }, runsOverTwice: { over: 1, of: 3 } });
  });
});
