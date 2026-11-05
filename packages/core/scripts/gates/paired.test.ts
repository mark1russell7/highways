import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { aaId, armOrder, childResult, envOf, measureIsolated, quantileOf, runChild, type Arm, type ChildResult } from "./paired.ts";

const env = { cpu: "Test CPU", cores: 2, os: "test", arch: "x64", node: "v0" };

/** A fake clock: each run of an arm moves the time by the cost of the arm on the input. No test reads the real time. */
function fakeArms(costs: Readonly<Record<string, Readonly<Record<string, number>>>>, log?: string[]) {
  let t = 0;
  const arms: Arm<string>[] = Object.keys(costs).map((id) => ({
    id,
    run: (input: string) => {
      log?.push(`${id}:${input}`);
      t += costs[id]![input]!;
    },
  }));
  return { arms, clock: () => t };
}

describe("armOrder", () => {
  it("reverses the order in each odd round of mode process", () => {
    expect([0, 1, 2, 3].map((r) => armOrder(2, r, "process"))).toEqual([[0, 1], [1, 0], [0, 1], [1, 0]]);
  });

  it("gives the rotated order of a report in mode fresh with no field order", () => {
    expect([0, 1, 2, 3].map((r) => armOrder(3, r, "fresh"))).toEqual([[0, 1, 2], [1, 2, 0], [2, 0, 1], [0, 1, 2]]);
  });
});

describe("measureIsolated in mode process", () => {
  it("runs the arms in turn on each input, ABBA over the rounds", () => {
    const log: string[] = [];
    const { arms, clock } = fakeArms({ A: { x: 1, y: 1 }, B: { x: 1, y: 1 } }, log);
    measureIsolated({ arms, inputs: [{ id: "x", value: "x" }, { id: "y", value: "y" }], repeats: 2, warmup: 0, mode: "process", aa: false, clock, env });
    expect(log).toEqual(["A:x", "B:x", "A:y", "B:y", "B:x", "A:x", "B:y", "A:y"]);
  });

  it("runs the warm-up of each arm just before its timed run, and does not time it", () => {
    const log: string[] = [];
    const { arms, clock } = fakeArms({ A: { x: 1 }, B: { x: 4 } }, log);
    const r = measureIsolated({ arms, inputs: [{ id: "x", value: "x" }], repeats: 1, warmup: 2, mode: "process", aa: false, clock, env });
    expect(log).toEqual(["A:x", "A:x", "A:x", "B:x", "B:x", "B:x"]);
    expect(r.inputs[0]!.ms).toEqual({ A: [1], B: [4] });
  });

  it("adds the A/A arm by default: a copy of the base with the id <base>~aa", () => {
    const log: string[] = [];
    const { arms, clock } = fakeArms({ A: { x: 2 }, B: { x: 3 } }, log);
    const r = measureIsolated({ arms, inputs: [{ id: "x", value: "x" }], repeats: 2, warmup: 0, mode: "process", clock, env });
    expect(aaId("A")).toBe("A~aa");
    expect(r.schema).toBe("paired-time/1");
    expect(r.mode).toBe("process");
    expect(r.base).toBe("A");
    expect(r.arms).toEqual(["A", "B", "A~aa"]);
    // The A/A arm calls the run of the base. Round 1 reverses the order.
    expect(log).toEqual(["A:x", "B:x", "A:x", "A:x", "B:x", "A:x"]);
    expect(r.inputs[0]!.ms["A~aa"]).toEqual([2, 2]);
    expect(Object.keys(r.ratios)).toEqual(["B", "A~aa"]);
    expect(r.noiseFloor).toEqual({ median: 1, p10: 1, p90: 1 });
  });

  it("gives null for moved and the noise floor without the A/A arm", () => {
    const { arms, clock } = fakeArms({ A: { x: 2 }, B: { x: 3 } });
    const r = measureIsolated({ arms, inputs: [{ id: "x", value: "x" }], repeats: 1, mode: "process", aa: false, clock, env });
    expect(r.arms).toEqual(["A", "B"]);
    expect(r.noiseFloor).toBeNull();
    expect(r.ratios["B"]!.moved).toBeNull();
    expect(r.ratios["B"]!.median).toBe(1.5);
  });

  it("gives the ratios, the quantiles, moved and the groups", () => {
    const ids = ["i1", "i2", "i3", "i4", "i5"];
    const base = Object.fromEntries(ids.map((i) => [i, 10]));
    const { arms, clock } = fakeArms({ A: base, B: { i1: 5, i2: 10, i3: 15, i4: 20, i5: 30 } });
    const groups = ["g1", "g1", "g2", "g2", undefined];
    const inputs = ids.map((id, k) => ({ id, value: id, ...(groups[k] === undefined ? {} : { group: groups[k] }) }));
    const r = measureIsolated({ arms, inputs, repeats: 3, mode: "process", clock, env, context: "test" });
    expect(r.context).toBe("test");
    expect(r.env).toEqual(env);
    expect(r.inputs.map((i) => i.ratio["B"])).toEqual([0.5, 1, 1.5, 2, 3]);
    expect(r.inputs[4]!.group).toBeUndefined();
    expect(r.inputs[0]!.median).toEqual({ A: 10, B: 5, "A~aa": 10 });
    const b = r.ratios["B"]!;
    expect(b.inputs).toBe(5);
    expect(b.median).toBe(1.5);
    // Linear interpolation: p10 is at 0.4 of the way from 0.5 to 1, and p90 at 0.6 of the way from 2 to 3.
    expect(b.p10).toBeCloseTo(0.7, 12);
    expect(b.p90).toBeCloseTo(2.6, 12);
    // The band of the A/A arm is [1, 1], so each input except i2 moved.
    expect(b.moved).toBeCloseTo(0.8, 12);
    expect(b.groups).toEqual({ all: 3, g1: 0.75, g2: 1.75 });
    expect(b.groupMean).toBeCloseTo(5.5 / 3, 12);
    const m = 5.5 / 3;
    expect(b.groupSD).toBeCloseTo(Math.sqrt(((3 - m) ** 2 + (0.75 - m) ** 2 + (1.75 - m) ** 2) / 2), 12);
    expect(r.ratios["A~aa"]!.moved).toBe(0);
    expect(r.ratios["A~aa"]!.groupSD).toBe(0);
  });

  it("gives a group SD of 0 with one group", () => {
    const { arms, clock } = fakeArms({ A: { x: 1, y: 1 }, B: { x: 2, y: 3 } });
    const r = measureIsolated({ arms, inputs: [{ id: "x", value: "x" }, { id: "y", value: "y" }], repeats: 1, mode: "process", clock, env });
    expect(r.ratios["B"]!.groups).toEqual({ all: 2.5 });
    expect(r.ratios["B"]!.groupSD).toBe(0);
  });

  it("refuses a peakRss in mode process", () => {
    const arms: Arm<undefined>[] = [{ id: "A", run: () => ({ peakRss: 1 }) }, { id: "B", run: () => 0 }];
    expect(() => measureIsolated({ arms, inputs: [{ id: "x" }], repeats: 1, mode: "process", env })).toThrow(/counts only in mode fresh/);
  });

  it("refuses bad options", () => {
    const run = () => 0;
    expect(() => measureIsolated({ arms: [], inputs: [{ id: "x" }], repeats: 1, mode: "process" })).toThrow(RangeError);
    expect(() => measureIsolated({ arms: [{ id: "A", run }], inputs: [{ id: "x" }], repeats: 0, mode: "process" })).toThrow(/repeats/);
    expect(() => measureIsolated({ arms: [{ id: "A", run }], inputs: [{ id: "x" }], repeats: 1, mode: "process", aa: false })).toThrow(/2 arms/);
    expect(() => measureIsolated({ arms: [{ id: "A" }, { id: "B", run }], inputs: [{ id: "x" }], repeats: 1, mode: "process" })).toThrow(/no run/);
    expect(() => measureIsolated({ arms: [{ id: "A", run }], inputs: [], repeats: 1, mode: "process" })).toThrow(/1 input/);
  });
});

describe("measureIsolated in mode fresh", () => {
  /** A fake start of a child: it logs each start and gives the time of the table. */
  function fakeStart(times: Readonly<Record<string, number>>, log: string[], peaks?: number[]) {
    return async (command: readonly string[], input: string, warmup: number): Promise<ChildResult> => {
      log.push(`${command.join(" ")}:${input}:${warmup}`);
      const peak = peaks?.shift();
      return peak === undefined ? { ms: times[command[0]!]! } : { ms: times[command[0]!]!, peakRss: peak };
    };
  }

  it("gives each input its arms in the order of the bench home, and each pair each order evenly", async () => {
    const log: string[] = [];
    const arms = ["A", "B", "C"].map((id) => ({ id, command: [id] }));
    await measureIsolated({ arms, inputs: [{ id: "x" }, { id: "y" }], repeats: 3, mode: "fresh", aa: false, startChild: fakeStart({ A: 1, B: 1, C: 1 }, log), env });
    expect(log.map((l) => l.split(":").slice(0, 2).join(":"))).toEqual([
      "A:x", "B:x", "C:x", "A:y", "B:y", "C:y",
      "C:x", "B:x", "A:x", "C:y", "B:y", "A:y",
      "B:x", "C:x", "A:x", "B:y", "C:y", "A:y",
    ]);
  });

  it("gives a pair of 4 arms each order evenly over 10 rounds, and states the order in the report", async () => {
    const log: string[] = [];
    const arms = ["A", "B", "C"].map((id) => ({ id, command: [id] }));
    const r = await measureIsolated({ arms, inputs: [{ id: "x" }], repeats: 10, mode: "fresh", startChild: fakeStart({ A: 1, B: 1, C: 1 }, log), env });
    expect(r.order).toBe("mirrored");
    expect(r.arms).toEqual(["A", "B", "C", "A~aa"]);
    // Each round is 4 starts. The A/A arm starts the command of the base, so this test reads the pair B and C.
    const rounds = Array.from({ length: 10 }, (_, k) => log.slice(k * 4, k * 4 + 4).map((l) => l.split(":")[0]!));
    expect(rounds.filter((round) => round.indexOf("B") < round.indexOf("C"))).toHaveLength(5);
  });

  it("passes the warm-up count to the child, and adds the A/A arm with the command of the base", async () => {
    const log: string[] = [];
    const arms = [{ id: "A", command: ["A", "--arm", "a"] }, { id: "B", command: ["B"] }];
    const r = await measureIsolated({ arms, inputs: [{ id: "x" }], repeats: 1, warmup: 3, mode: "fresh", startChild: fakeStart({ A: 4, B: 2 }, log), env });
    expect(log).toEqual(["A --arm a:x:3", "B:x:3", "A --arm a:x:3"]);
    expect(r.mode).toBe("fresh");
    expect(r.arms).toEqual(["A", "B", "A~aa"]);
    expect(r.inputs[0]!.ratio).toEqual({ B: 0.5, "A~aa": 1 });
  });

  it("keeps the largest peakRss of each arm over its rounds", async () => {
    const arms = [{ id: "A", command: ["A"] }, { id: "B", command: ["B"] }];
    // The rounds give A B, then B A.
    const r = await measureIsolated({ arms, inputs: [{ id: "x" }], repeats: 2, mode: "fresh", aa: false, startChild: fakeStart({ A: 1, B: 1 }, [], [10, 30, 40, 20]), env });
    expect(r.inputs[0]!.peakRss).toEqual({ A: 20, B: 40 });
  });

  it("rejects when a child fails or gives no time", async () => {
    const arms = [{ id: "A", command: ["A"] }, { id: "B", command: ["B"] }];
    const failing = async (): Promise<ChildResult> => {
      throw new Error("The child exited with the code 3.");
    };
    await expect(measureIsolated({ arms, inputs: [{ id: "x" }], repeats: 1, mode: "fresh", startChild: failing, env })).rejects.toThrow(/code 3/);
    const silent = async () => ({}) as ChildResult;
    await expect(measureIsolated({ arms, inputs: [{ id: "x" }], repeats: 1, mode: "fresh", startChild: silent, env })).rejects.toThrow(/gave no time/);
    await expect(measureIsolated({ arms: [{ id: "A" }, { id: "B", command: ["B"] }], inputs: [{ id: "x" }], repeats: 1, mode: "fresh" })).rejects.toThrow(/no command/);
  });
});

describe("childResult", () => {
  it("reads the last line of the stdout", () => {
    expect(childResult("a log line\r\n{\"ms\":2.5,\"peakRss\":1024}\r\n")).toEqual({ ms: 2.5, peakRss: 1024 });
    expect(childResult('{"ms":1}')).toEqual({ ms: 1 });
  });

  it("refuses a line with no ms", () => {
    expect(() => childResult("done")).toThrow(/no line/);
    expect(() => childResult('{"peakRss":1}')).toThrow(/no line/);
    expect(() => childResult("")).toThrow(/no line/);
  });
});

describe("runChild", () => {
  it("runs the warm-up untimed, times one run and prints the line", () => {
    let t = 0;
    const calls: number[] = [];
    const lines: string[] = [];
    const r = runChild(
      (id) => Number(id),
      (n) => {
        calls.push(n);
        t += 7;
      },
      { argv: ["--input", "5", "--warmup", "2"], clock: () => t, peakRss: false, write: (l) => lines.push(l) },
    );
    expect(calls).toEqual([5, 5, 5]);
    expect(r).toEqual({ ms: 7 });
    expect(lines).toEqual(['{"ms":7}']);
  });

  it("adds the peakRss of the process by default, and needs --input", () => {
    const r = runChild(() => 0, () => 0, { argv: ["--input", "x", "--warmup", "0"], write: () => {} });
    expect(r.peakRss).toBeGreaterThan(0);
    expect(() => runChild(() => 0, () => 0, { argv: [], write: () => {} })).toThrow(/--input/);
  });
});

describe("envOf", () => {
  it("names the computer, the mode and the context", () => {
    const e = envOf("process");
    expect(e.mode).toBe("process");
    expect(e.cores).toBeGreaterThan(0);
    expect(e.cpu.length).toBeGreaterThan(0);
    expect(e.node).toBe(process.version);
    expect(typeof e.context).toBe("string");
  });
});

describe("a real child", () => {
  const dir = mkdtempSync(join(tmpdir(), "paired-"));
  const child = join(dir, "child.mjs");
  const helper = pathToFileURL(fileURLToPath(new URL("./paired.ts", import.meta.url))).href;
  writeFileSync(
    child,
    [
      `import { runChild } from ${JSON.stringify(helper)};`,
      `const args = process.argv.slice(2);`,
      `if (args.includes("--fail")) process.exit(3);`,
      `if (args.includes("--silent")) { console.log("no time here"); process.exit(0); }`,
      `runChild((id) => id.length, (n) => { let s = 0; for (let i = 0; i < n * 1000; i++) s += i; return s; });`,
    ].join("\n") + "\n",
  );
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("starts the child through process.execPath and reads its line", async () => {
    const arms = [{ id: "A", command: [process.execPath, child] }, { id: "B", command: [process.execPath, child, "--arm", "b"] }];
    const r = await measureIsolated({ arms, inputs: [{ id: "x" }], repeats: 1, warmup: 1, mode: "fresh", env });
    expect(r.arms).toEqual(["A", "B", "A~aa"]);
    for (const id of r.arms) {
      expect(r.inputs[0]!.ms[id]).toHaveLength(1);
      expect(r.inputs[0]!.ms[id]![0]).toBeGreaterThanOrEqual(0);
      expect(r.inputs[0]!.peakRss![id]).toBeGreaterThan(0);
    }
  }, 30_000);

  it("rejects a child with a code other than 0, or with no ms line", async () => {
    const run = (extra: string) =>
      measureIsolated({ arms: [{ id: "A", command: [process.execPath, child, extra] }, { id: "B", command: [process.execPath, child] }], inputs: [{ id: "x" }], repeats: 1, mode: "fresh", aa: false, env });
    await expect(run("--fail")).rejects.toThrow(/code 3/);
    await expect(run("--silent")).rejects.toThrow(/no line/);
  }, 30_000);
});

describe("quantileOf", () => {
  it("interpolates between the two nearest values", () => {
    expect(quantileOf([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(quantileOf([1, 2], 0.1)).toBeCloseTo(1.1, 12);
    expect(quantileOf([], 0.5)).toBeNaN();
  });
});
