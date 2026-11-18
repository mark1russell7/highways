import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InputError } from "./gates/inputs.ts";
import {
  emptyNoise,
  FLIP_CHECK_RUNS,
  flipNoReads,
  mergeNoise,
  NOISE_FILE,
  NOISE_SCHEMA,
  noiseRow,
  noisyShare,
  parseNoise,
  startChoice,
  type FlipOutcome,
  type NoiseFlip,
  type NoiseRun,
  type NoiseTable,
} from "./sections-noise.ts";

const NOISY_CPU = "AMD EPYC 9V74 80-Core Processor";
const row = (run: number, cpu: string, rounds: number, noisy: boolean, job = "gate"): NoiseRun => ({ source: "gate", run, job, date: "2026-11-17", cpu, rounds, spread: noisy ? 0.09 : 0.02, noisy });
const flip = (run: number, outcome: FlipOutcome): NoiseFlip => ({ run, date: "2026-11-18", cpu: NOISY_CPU, outcome });
const table = (runs: readonly NoiseRun[], flips: readonly NoiseFlip[] = []): NoiseTable => ({ schema: NOISE_SCHEMA, runs, flips });
const flips = (count: number, noReads: number): NoiseFlip[] => Array.from({ length: count }, (_x, k) => flip(k + 1, k < noReads ? "no read" : "pass"));

describe("the committed noise table", () => {
  const committed = parseNoise(readFileSync(new URL(`../${NOISE_FILE}`, import.meta.url), "utf8"));

  it("holds the runs of the replay of the flip fix", () => {
    expect(noisyShare(committed, NOISY_CPU, 10)).toMatchObject({ runs: 4, noisy: 4 });
    expect(noisyShare(committed, NOISY_CPU, 20)).toMatchObject({ runs: 3, noisy: 1 });
  });

  it("GATE-FLIP: the flip of the sections gate has no read in 1 of 20 flips or fewer", () => {
    const count = flipNoReads(committed);
    expect(count.ok, count.reason).toBe(true);
  });
});

describe("parseNoise", () => {
  const ok = table([row(1, NOISY_CPU, 10, true)], [flip(2, "pass")]);

  it("reads a valid table and refuses each table that is not valid", () => {
    expect(parseNoise(JSON.stringify(ok))).toEqual(ok);
    expect(() => parseNoise("{")).toThrow(InputError);
    expect(() => parseNoise(JSON.stringify({ ...ok, schema: "other" }))).toThrow(InputError);
    expect(() => parseNoise(JSON.stringify(table([row(1, NOISY_CPU, 10, true), row(1, NOISY_CPU, 20, false)])))).toThrow("two times");
    expect(() => parseNoise(JSON.stringify(table([{ ...row(1, NOISY_CPU, 10, true), rounds: 0 }])))).toThrow(InputError);
    expect(() => parseNoise(JSON.stringify(table([], [flip(2, "pass"), flip(2, "fail")])))).toThrow("two times");
    expect(() => parseNoise(JSON.stringify(table([], [{ ...flip(2, "pass"), outcome: "green" as FlipOutcome }])))).toThrow(InputError);
  });

  it("keeps two jobs of one run as two rows", () => {
    expect(parseNoise(JSON.stringify(table([row(1, NOISY_CPU, 10, true), row(1, NOISY_CPU, 20, false, "retry")]))).runs).toHaveLength(2);
  });
});

describe("noiseRow", () => {
  const record = { rounds: 10, env: { cpu: NOISY_CPU }, home: { noise: { spread: 0.07, cap: 0.058, noisy: true } } } as unknown as Parameters<typeof noiseRow>[0];

  it("takes the CPU model, the rounds and the noise of a record", () => {
    expect(noiseRow(record, { source: "flip", run: 9, job: "clean-1", date: "2026-11-18" })).toEqual({ source: "flip", run: 9, job: "clean-1", date: "2026-11-18", cpu: NOISY_CPU, rounds: 10, spread: 0.07, noisy: true });
  });

  it("gives no row for a record with no A/A spread", () => {
    expect(noiseRow({ ...record, home: null }, { source: "gate", run: 9, job: "gate", date: "2026-11-18" })).toBeNull();
  });
});

describe("mergeNoise", () => {
  it("keeps each old row, adds each new key and sorts by run", () => {
    const old = table([row(5, NOISY_CPU, 10, true)], [flip(5, "pass")]);
    const merged = mergeNoise(old, [row(5, NOISY_CPU, 10, false), row(3, "other", 10, false)], [flip(5, "no read"), flip(4, "pass")]);
    expect(merged.runs.map((r) => [r.run, r.noisy])).toEqual([
      [3, false],
      [5, true],
    ]);
    expect(merged.flips.map((f) => [f.run, f.outcome])).toEqual([
      [4, "pass"],
      [5, "pass"],
    ]);
    expect(mergeNoise(emptyNoise(), [], [])).toEqual(emptyNoise());
  });
});

describe("startChoice", () => {
  const runs = [...[1, 2, 3, 4].map((k) => row(k, NOISY_CPU, 10, true)), row(5, "quiet", 10, false), row(6, "quiet", 10, true), row(7, "half", 10, true), row(8, "half", 10, false)];

  it("starts the clean arm with 2 times the rounds on a CPU model with a noisy share above 1/2", () => {
    const start = startChoice(table(runs), NOISY_CPU, 10);
    expect(start.attempt).toBe("2");
    expect(start.share).toMatchObject({ runs: 4, noisy: 4, share: 1 });
    expect(start.share.low).toBeCloseTo(0.51, 2);
    expect(start.reason).toContain("4 of 4 runs of 10 rounds");
  });

  it("starts with the base rounds at a share of 1/2 or below, and on a CPU model that the table does not have", () => {
    expect(startChoice(table(runs), "quiet", 10).attempt).toBe("1");
    expect(startChoice(table(runs), "half", 10).attempt).toBe("1");
    expect(startChoice(table(runs), "new", 10)).toMatchObject({ attempt: "1", share: { runs: 0, share: null } });
    expect(startChoice(table(runs), NOISY_CPU, 20).attempt).toBe("1");
  });
});

describe("flipNoReads", () => {
  it(`decides only from ${FLIP_CHECK_RUNS} flips`, () => {
    expect(flipNoReads(table([], flips(19, 5))).ok).toBe(true);
    expect(flipNoReads(emptyNoise())).toMatchObject({ flips: 0, share: null, ok: true });
  });

  it("fails above 1 no read in 20 flips, and tells to give the runs more rounds", () => {
    expect(flipNoReads(table([], flips(20, 1))).ok).toBe(true);
    const fail = flipNoReads(table([], flips(20, 2)));
    expect(fail).toMatchObject({ flips: 20, noReads: 2, share: 0.1, ok: false });
    expect(fail.reason).toContain("more rounds, not more runs");
    expect(flipNoReads(table([], flips(40, 2))).ok).toBe(true);
  });

  it("gives the Wilson interval at 95 % of the share", () => {
    const count = flipNoReads(table([], flips(20, 1)));
    expect(count.low).toBeCloseTo(0.0089, 3);
    expect(count.high).toBeCloseTo(0.2361, 3);
  });
});
