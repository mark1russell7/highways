// The paired times of `portfolio:time` in mode fresh (BENCH-FRESH-CASES). The tests give their own start of a child, so no test starts a process.
// Only `pairedChild` routes, on one board of 10 nodes, as a check of the child protocol. No test reads its time.
import { describe, expect, it } from "vitest";
import type { ChildResult } from "./gates/paired.ts";
import type { Graph } from "../src/model.ts";
import type { Strategy } from "../src/strategies/model.ts";
import { boardId, COST_FORMS, costPaired, exactBoardOf, MODEL_ARM, PICK_ARM, pairedChild, sharedPaired } from "./portfolio-time.ts";

/** A made-up board: only the node count enters the id of a board. */
const board = (cls: string, nodes: number, seed: number) => ({ cls, seed, graph: { nodes: Array.from({ length: nodes }, (_, i) => ({ id: `n${i}` })), edges: [] } as unknown as Graph });

/** This function gives a start of a child that keeps each call and gives a made-up time. */
function fakeStart() {
  const calls: { command: readonly string[]; input: string; warmup: number }[] = [];
  const startChild = async (command: readonly string[], input: string, warmup: number): Promise<ChildResult> => {
    calls.push({ command, input, warmup });
    return { ms: 10 + calls.length, peakRss: 1000 };
  };
  return { calls, startChild };
}

describe("sharedPaired", () => {
  it("starts a fresh child for each arm, each board and each round, with the A/A arm of shared", async () => {
    const { calls, startChild } = fakeStart();
    const strategies = [{ name: "corners" }, { name: "shared" }] as unknown as Strategy<"router", object>[];
    const report = await sharedPaired([board("uniform", 10, 0), board("hubs", 10, 1)], strategies, 2, { command: ["node", "portfolio-time.ts", "--sizes", "10"], startChild });
    expect(report.mode).toBe("fresh");
    expect(report.arms).toEqual(["shared", "corners", "shared~aa"]);
    expect(report.inputs.map((i) => i.id)).toEqual([boardId("uniform", 10, 0), boardId("hubs", 10, 1)]);
    // 2 boards x 3 arms x 2 rounds, one child at a time.
    expect(calls).toHaveLength(12);
    expect(calls[0]!.command).toEqual(["node", "portfolio-time.ts", "--sizes", "10", "--paired-child", "shared", "--arm", "shared"]);
    expect(calls.every((c) => c.warmup === 1)).toBe(true);
    // The A/A arm copies the command of the base.
    expect(calls.filter((c) => c.command.at(-1) === "shared")).toHaveLength(8);
  });
});

describe("costPaired", () => {
  it("gives one fresh report for each form, with the arms model and pick", async () => {
    const { calls, startChild } = fakeStart();
    const lines = await costPaired([board("clustered", 24, 2)], 1, { command: ["node", "portfolio-time.ts"], startChild });
    expect(lines.map((l) => l.form)).toEqual(COST_FORMS.map((f) => f.id));
    expect(lines.every((l) => l.paired.mode === "fresh" && l.paired.arms.join() === [MODEL_ARM, PICK_ARM, `${MODEL_ARM}~aa`].join())).toBe(true);
    expect(calls).toHaveLength(COST_FORMS.length * 3);
    expect(calls[1]!.command.slice(2)).toEqual(["--paired-child", "cost", "--form", COST_FORMS[0]!.id, "--arm", PICK_ARM]);
    expect(calls[1]!.input).toBe(boardId("clustered", 24, 2));
  });
});

describe("exactBoardOf and pairedChild", () => {
  it("makes the exact board of an id, and refuses an id with no board", () => {
    expect(exactBoardOf("uniform/n10/s0", [10]).nodes).toHaveLength(10);
    expect(() => exactBoardOf("square/n10/s0", [10])).toThrow(/is not <class>/);
    expect(() => exactBoardOf("uniform/n11/s0", [])).not.toThrow();
  });

  it("writes one line of the child protocol for the base on one board", () => {
    const lines: string[] = [];
    const result = pairedChild("shared", ["--sizes", "10", "--arm", "shared", "--input", "uniform/n10/s0", "--warmup", "0"], (line) => lines.push(line));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toEqual(result);
    expect(Number.isFinite(result.ms)).toBe(true);
    expect(() => pairedChild("shared", ["--arm", "no-such-strategy", "--input", "uniform/n10/s0"], () => undefined)).toThrow(/no strategy/);
    expect(() => pairedChild("other", ["--arm", "shared", "--input", "uniform/n10/s0"], () => undefined)).toThrow(/no paired child/);
  });
});
