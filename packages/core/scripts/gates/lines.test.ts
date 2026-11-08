import { describe, expect, it } from "vitest";
import { droppedLine, droppedReads } from "./lines.ts";

describe("the case reads of a verdict that leaves out a mixed pair (NO-READ-LINE)", () => {
  const r = (input: string, seed: number, v?: number) => ({ input, seed, measures: v === undefined ? {} : { m: v } });
  const before = [r("a", 1, 1), r("a", 1, 2), r("b", 1, 3), r("c", 2)];
  const after = [r("a", 1), r("a", 1, 2), r("b", 1, 3), r("c", 2)];

  it("gives one read for each input and seed with a value, and a no read when the filter removed a value", () => {
    expect(droppedReads(before, after, "m")).toEqual([
      { case: "a#1", outcome: "no read" },
      { case: "b#1", outcome: "pass" },
    ]);
    expect(droppedReads(before, before, "m").every((c) => c.outcome === "pass")).toBe(true);
    expect(() => droppedReads(before, after.slice(1), "m")).toThrow(RangeError);
  });

  it("gives a report-only line that names the count, the case and the reason", () => {
    const line = droppedLine(before, after, "m", "Screen verdict x on m")!;
    expect(line.level).toBe("warning");
    expect(line.noReads).toEqual({ count: 1, cases: ["a#1"] });
    expect(line.text).toContain("no read for 1 of 2 cases: a#1.");
    expect(line.text).toContain("The measure m pairs an estimate with a full count");
    expect(droppedLine(before, before, "m", "x")).toBeUndefined();
    expect(droppedLine([r("c", 2)], [r("c", 2)], "m", "x")).toBeUndefined();
  });
});
