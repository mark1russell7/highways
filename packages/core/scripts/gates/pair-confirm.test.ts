import { describe, expect, it } from "vitest";
import { aaId, pairedReport, type ChildResult, type RawTimes } from "./paired.ts";
import { COMMIT_ARM, PARENT_ARM, aaRatios, armRows, confirmPair, pairVerdicts, spreadOf, verdictOf } from "./pair-confirm.ts";

// Made-up times only. No test reads a clock or starts a process.
const ENV = { cpu: "Made-up CPU", cores: 4, os: "test", arch: "x64", node: "v0" };

/** This function gives a made-up start of a child: the time is the factor of the command times the base time of the input, times the factor of the call. */
function fakeStart(factors: Readonly<Record<string, number>>, baseMs: Readonly<Record<string, number>>, noise: readonly number[] = [1]) {
  const calls: { command: string; input: string; warmup: number }[] = [];
  const start = async (command: readonly string[], input: string, warmup: number): Promise<ChildResult> => {
    const id = command[0]!;
    const n = calls.length;
    calls.push({ command: id, input, warmup });
    return { ms: factors[id]! * baseMs[input]! * noise[n % noise.length]! };
  };
  return { start, calls };
}

describe("the timing of a pair", () => {
  it("times the parent, the commit and the A/A arm of the parent on each input, each round, with the arms in turn", async () => {
    const { start, calls } = fakeStart({ old: 1, new: 3 }, { a: 100, b: 50 });
    const report = await confirmPair({ parent: ["old"], commit: ["new"], inputs: ["a", "b"], rounds: 3, startChild: start, env: ENV, context: "test" });
    expect(report.schema).toBe("paired-time/1");
    expect(report.mode).toBe("fresh");
    expect(report.base).toBe(PARENT_ARM);
    expect(report.arms).toEqual([PARENT_ARM, COMMIT_ARM, aaId(PARENT_ARM)]);
    expect(report.env.cpu).toBe("Made-up CPU");
    // 3 rounds x 2 inputs x 3 arms, one child at a time. The A/A arm starts the command of the parent.
    expect(calls).toHaveLength(18);
    expect(calls.every((c) => c.warmup === 0)).toBe(true);
    expect(calls.slice(0, 3).map((c) => c.command)).toEqual(["old", "new", "old"]);
    expect(calls.slice(6, 9).map((c) => c.command)).toEqual(["new", "old", "old"]);
    expect(report.inputs.map((i) => i.id)).toEqual(["a", "b"]);
    expect(report.inputs[0]!.ratio[COMMIT_ARM]).toBeCloseTo(3, 10);
    expect(report.inputs[1]!.median[PARENT_ARM]).toBe(50);
  });

  it("times the arms of others after the commit, with the A/A arm last", async () => {
    const { start, calls } = fakeStart({ old: 1, new: 2, fix: 4 }, { a: 100 });
    const report = await confirmPair({ parent: ["old"], commit: ["new"], others: [{ id: "fixed", command: ["fix"] }], inputs: ["a"], rounds: 4, startChild: start, env: ENV, context: "test" });
    expect(report.arms).toEqual([PARENT_ARM, COMMIT_ARM, "fixed", aaId(PARENT_ARM)]);
    // 4 rounds x 1 input x 4 arms. The order rotates by one arm in each round.
    expect(calls).toHaveLength(16);
    expect(calls.slice(0, 4).map((c) => c.command)).toEqual(["old", "new", "fix", "old"]);
    expect(calls.slice(4, 8).map((c) => c.command)).toEqual(["new", "fix", "old", "old"]);
    expect(report.inputs[0]!.ratio["fixed"]).toBeCloseTo(4, 10);
  });

  it("refuses an arm of others with the id of another arm", async () => {
    const { start } = fakeStart({ old: 1, new: 1 }, { a: 1 });
    await expect(confirmPair({ parent: ["old"], commit: ["new"], others: [{ id: COMMIT_ARM, command: ["new"] }], inputs: ["a"], rounds: 1, startChild: start })).rejects.toThrow(RangeError);
  });

  it("refuses a bad count of rounds", async () => {
    const { start } = fakeStart({ old: 1, new: 1 }, { a: 1 });
    await expect(confirmPair({ parent: ["old"], commit: ["new"], inputs: ["a"], rounds: 0, startChild: start })).rejects.toThrow(RangeError);
    await expect(confirmPair({ parent: ["old"], commit: ["new"], inputs: [], rounds: 1, startChild: start })).rejects.toThrow(RangeError);
  });
});

/** This function gives a made-up confirm report of one input. Each list has the times of the rounds. */
function report(parent: readonly number[], commit: readonly number[], aa: readonly number[]) {
  const arms = [{ id: PARENT_ARM }, { id: COMMIT_ARM }, { id: aaId(PARENT_ARM) }];
  const inputs = [{ id: "sections", group: "sections" }];
  const raw: RawTimes = {
    ms: new Map([["sections", new Map([[PARENT_ARM, [...parent]], [COMMIT_ARM, [...commit]], [aaId(PARENT_ARM), [...aa]]])]]),
    peak: new Map([["sections", new Map()]]),
  };
  return pairedReport("fresh", ENV, "test", arms, inputs, raw);
}

describe("the verdict of a pair", () => {
  it("gives the A/A ratio of each round, and the spread as p90 of |r - 1|", () => {
    const r = report([100, 100, 100], [100, 100, 100], [98, 100, 102]);
    expect(aaRatios(r, "sections")).toEqual([0.98, 1, 1.02]);
    expect(aaRatios(r, "nope")).toEqual([]);
    expect(spreadOf([0.98, 1, 1.02])).toBeCloseTo(0.02, 10);
    expect(spreadOf([])).toBeNaN();
  });

  it("compares a ratio with the band 1 ± spread, and keeps an edge inside", () => {
    expect(verdictOf(1.05, 0.05)).toBe("inside");
    expect(verdictOf(1.051, 0.05)).toBe("slower");
    expect(verdictOf(0.949, 0.05)).toBe("faster");
    expect(verdictOf(null, 0.05)).toBe("not measured");
    expect(verdictOf(1.2, Number.NaN)).toBe("not measured");
  });

  it("gives slower, faster or inside from the band of the same report", () => {
    const aa = [98, 100, 102];
    const slow = pairVerdicts(report([100, 100, 100], [300, 290, 310], aa))[0]!;
    expect(slow.input).toBe("sections");
    expect(slow.ratio).toBeCloseTo(3, 10);
    expect(slow.parentMs).toBe(100);
    expect(slow.commitMs).toBe(300);
    expect(slow.spread).toBeCloseTo(0.02, 10);
    expect(slow.band!.lo).toBeCloseTo(0.98, 10);
    expect(slow.band!.hi).toBeCloseTo(1.02, 10);
    expect(slow.verdict).toBe("slower");
    expect(pairVerdicts(report([100, 100, 100], [60, 61, 59], aa))[0]!.verdict).toBe("faster");
    expect(pairVerdicts(report([100, 100, 100], [101, 101, 101], aa))[0]!.verdict).toBe("inside");
  });

  it("gives the rows of each arm with the band of the A/A rounds, also for a base with another id", () => {
    const arms = [{ id: "base" }, { id: "x" }, { id: aaId("base") }];
    const raw: RawTimes = {
      ms: new Map([["one", new Map([["base", [100, 100, 100]], ["x", [104, 104, 104]], [aaId("base"), [90, 100, 110]]])]]),
      peak: new Map([["one", new Map()]]),
    };
    const rows = armRows(pairedReport("fresh", ENV, "test", arms, [{ id: "one" }], raw), "x");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ratio).toBeCloseTo(1.04, 10);
    expect(rows[0]!.baseMs).toBe(100);
    expect(rows[0]!.armMs).toBe(104);
    // The A/A ratios 0.9, 1, 1.1 give the spread p90 of 0.1, 0, 0.1: 0.1. So 1.04 is inside the band of one input.
    expect(rows[0]!.spread).toBeCloseTo(0.1, 10);
    expect(rows[0]!.verdict).toBe("inside");
    expect(armRows(pairedReport("fresh", ENV, "test", arms, [{ id: "one" }], raw), "nope")[0]!.verdict).toBe("not measured");
  });

  it("refuses a report with other arms", () => {
    const other = pairedReport("fresh", ENV, "test", [{ id: "base" }, { id: COMMIT_ARM }], [{ id: "x" }], {
      ms: new Map([["x", new Map([["base", [1]], [COMMIT_ARM, [1]]])]]),
      peak: new Map([["x", new Map()]]),
    });
    expect(() => pairVerdicts(other)).toThrow(RangeError);
  });
});
