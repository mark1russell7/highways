import { describe, expect, it } from "vitest";
import { annotation, droppedCases, escapeData, mixedKindsWhy, noReadText } from "./annotate.ts";

describe("the annotations of the gates (NO-READ-LINE)", () => {
  it("escapes a percent sign and a new line, so the line stays one command", () => {
    expect(escapeData("5% of a\nb\r")).toBe("5%25 of a%0Ab%0D");
    expect(annotation("warning", "Gate: one, two", "a\nb")).toBe("::warning title=Gate%3A one%2C two::a%0Ab");
    expect(annotation("error", "Heap gate", "x")).toBe("::error title=Heap gate::x");
  });

  it("gives the count of the cases, the reason, the cases and the CPU models of a no read", () => {
    expect(noReadText({ cases: ["one"], why: "too few rounds.", cpus: ["CPU A", "CPU A"] })).toBe("No read of 1 case: too few rounds. The cases: one. The CPU model: CPU A.");
    expect(noReadText({ cases: ["a", "b"], why: "a mixed pair", cpus: ["CPU A", "CPU B"] })).toBe("No read of 2 cases: a mixed pair. The cases: a, b. The CPU models: CPU A and CPU B.");
    expect(noReadText({ cases: ["a"], why: "a short run", cpus: [] })).toContain("The record has no CPU model.");
    expect(noReadText({ cases: ["a"], why: "a drop" })).toBe("No read of 1 case: a drop. The cases: a.");
    const many = noReadText({ cases: Array.from({ length: 12 }, (_, i) => `c${i}`), why: "a cap" });
    expect(many).toContain("No read of 12 cases");
    expect(many).toContain("c9, and 2 more.");
    expect(many).not.toContain("c10");
  });

  it("gives each input and seed whose value a filter removed, one time each", () => {
    const r = (input: string, seed: number, v?: number) => ({ input, seed, measures: v === undefined ? {} : { m: v } });
    const before = [r("a", 1, 1), r("a", 1, 2), r("b", 1, 3), r("c", 2)];
    const after = [r("a", 1), r("a", 1), r("b", 1, 3), r("c", 2)];
    expect(droppedCases(before, after, "m")).toEqual(["a#1"]);
    expect(droppedCases(before, before, "m")).toEqual([]);
    expect(() => droppedCases(before, after.slice(1), "m")).toThrow(RangeError);
    expect(mixedKindsWhy("m")).toContain("the measure m pairs an estimate with a full count");
  });
});
