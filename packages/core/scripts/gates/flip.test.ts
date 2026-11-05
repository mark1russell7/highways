import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROUTERS } from "../../src/routers/index.ts";
import { changeOneStop, flipPassed, flipTable, judge, SCHEMA, SECTIONS_FILE, withSpin, type ArmRead, type FlipArm } from "./flip.ts";
import { firstDifference } from "./same-stops.ts";

const read = (over: Partial<ArmRead>): ArmRead => ({ id: "a", fault: null, exit: 0, text: "pass", ...over });
const clean: FlipArm = judge(read({}), { exit: 0, reason: "pass" });
const fault: FlipArm = judge(read({ id: "b", fault: "150 MB", exit: 1, text: "fail: above" }), { exit: 1, reason: "above" });

describe("judge", () => {
  it("needs the exit code and the reason", () => {
    expect(clean.ok).toBe(true);
    expect(judge(read({ exit: 1 }), { exit: 0, reason: "pass" }).ok).toBe(false);
    expect(judge(read({ text: "crash" }), { exit: 0, reason: "pass" }).ok).toBe(false);
  });

  it("does not read a crash as a red", () => {
    expect(judge(read({ fault: "150 MB", exit: 1, text: "TypeError: x" }), { exit: 1, reason: "above" }).ok).toBe(false);
    expect(judge(read({ fault: "150 MB", exit: null, text: "" }), { exit: 1, reason: "above" }).ok).toBe(false);
  });
});

describe("flipPassed", () => {
  it("passes on a green clean arm and a red fault arm", () => {
    expect(flipPassed([clean, fault])).toBe(true);
  });

  it("fails on an arm that is not as stated", () => {
    expect(flipPassed([clean, { ...fault, ok: false }])).toBe(false);
    expect(flipPassed([{ ...clean, ok: false }, fault])).toBe(false);
  });

  it("fails when an arm of the pair is absent", () => {
    expect(flipPassed([clean])).toBe(false);
    expect(flipPassed([fault])).toBe(false);
    expect(flipPassed([])).toBe(false);
  });
});

describe("withSpin", () => {
  it("wraps the router of the real file", () => {
    const source = readFileSync(new URL(`../../../../${SECTIONS_FILE}`, import.meta.url), "utf8");
    const spun = withSpin(source, 0.2);
    expect(spun.split("export function sectionsRouter(").length).toBe(2);
    expect(spun).toContain("function flipPlainRouter(options: SectionsOptions): Router {");
    expect(spun).toContain("* 1.2;");
  });

  it("refuses a file with no anchor", () => {
    expect(() => withSpin("const a = 1;", 0.2)).toThrow("does not hold one");
  });
});

describe("the stops", () => {
  it("changes one stop and keeps the others", () => {
    const text = `${JSON.stringify({ budget: 1, evaluations: 4 })}\n${JSON.stringify({ budget: 10, evaluations: 9 })}\n`;
    const changed = changeOneStop(text).split("\n");
    expect(JSON.parse(changed[0]!)).toEqual({ budget: 1, evaluations: 5 });
    expect(changed.slice(1)).toEqual(text.split("\n").slice(1));
  });

  it("finds the first difference of two files", () => {
    const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
    expect(firstDifference(bytes("abc"), bytes("abc"))).toBeNull();
    expect(firstDifference(bytes("abc"), bytes("abd"))).toBe(2);
    expect(firstDifference(bytes("abc"), bytes("ab"))).toBe(2);
    expect(firstDifference(bytes(""), bytes(""))).toBeNull();
  });
});

describe("flipTable", () => {
  it("states the result and each arm", () => {
    const table = flipTable({ schema: SCHEMA, check: "heap", arms: [clean, fault], passed: true, env: {} as never });
    expect(table).toContain("The flip of `heap`: passed");
    expect(table).toContain("| b | 150 MB | 1 | 1 | above |");
  });
});

describe("the budgets of the heap gate", () => {
  it("name each default router, so that no default router is out of the gate", () => {
    const budgets = JSON.parse(readFileSync(new URL("../data/heap/budgets.json", import.meta.url), "utf8")) as { routers: Readonly<Record<string, unknown>> };
    for (const router of ROUTERS) expect(Object.keys(budgets.routers)).toContain(router.name);
  });
});
