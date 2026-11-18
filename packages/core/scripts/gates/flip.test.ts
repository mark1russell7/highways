import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROUTERS } from "../../src/routers/index.ts";
import { changeOneStop, flipOutcome, flipPassed, flipTable, judge, SCHEMA, SECTIONS_FILE, SECTIONS_WANT, sectionsAttempts, withSpin, type ArmRead, type FlipArm } from "./flip.ts";
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

describe("flipOutcome", () => {
  const noRead = judge(read({ exit: 1, text: "cannot decide, in the words of the home cannot decide: no read", runs: 4, noRead: true }), { exit: 1, reason: "no read" });

  it("reads an arm with no read as not stated, whatever its exit code and text", () => {
    expect(noRead.ok).toBe(false);
  });

  it("gives pass, fail and no read", () => {
    expect(flipOutcome([clean, fault])).toBe("pass");
    expect(flipOutcome([noRead, fault])).toBe("no read");
    expect(flipOutcome([clean, { ...fault, ok: false }])).toBe("fail");
    expect(flipOutcome([clean])).toBe("fail");
  });

  it("puts a fail before a no read", () => {
    expect(flipOutcome([noRead, { ...fault, ok: false }])).toBe("fail");
  });

  it("names a no read in the table", () => {
    const table = flipTable({ schema: SCHEMA, check: "sections", arms: [noRead, fault], passed: false, outcome: "no read", env: { cpu: "c", cores: 1, os: "linux", arch: "x64", node: "v26", mode: "fresh" } });
    expect(table).toContain("## The flip of `sections`: no read");
    expect(table).toContain("| 4 |  | no read |");
  });
});

describe("the wanted reads of the sections flip", () => {
  // The texts of the runs of the job sections of run 44204869166, with the outcome first, as sectionsFlip writes them.
  const beyond = "fail, in the words of the home cannot decide: The home finds the head beyond the limit 1.10 of the fixed base (ratio 1.420, floor 1.250).";
  const slower = "fail, in the words of the home slower: The home finds the head slower than the parent (ratio 1.232).";
  const unread = "cannot decide, in the words of the home cannot decide: The home cannot decide the head against the limit 1.10 of the fixed base (ratio 1.149, bound 1.214).";
  const closed = "fail, in the words of the home not measured: A check has no time, so the run fails (FAIL-CLOSED).";
  const passed = "pass, in the words of the home same: The home finds the head same against the parent (ratio 0.998).";

  it("takes only a decided fail of the check against the fixed base as the red of the slower arm", () => {
    expect(judge(read({ fault: "spin", exit: 1, text: beyond }), SECTIONS_WANT.slower).ok).toBe(true);
    expect(judge(read({ fault: "spin", exit: 1, text: slower }), SECTIONS_WANT.slower).ok).toBe(false);
    expect(judge(read({ fault: "spin", exit: 1, text: unread }), SECTIONS_WANT.slower).ok).toBe(false);
    expect(judge(read({ fault: "spin", exit: 1, text: closed }), SECTIONS_WANT.slower).ok).toBe(false);
  });

  it("gives the clean arm up to 3 runs of 2 times the rounds, after a first run of the base rounds or in its place", () => {
    expect(sectionsAttempts("clean", "1")).toEqual(["1", "2", "2", "2"]);
    expect(sectionsAttempts("clean", "2")).toEqual(["2", "2", "2"]);
    expect(sectionsAttempts("slower", "1")).toEqual(["1", "2"]);
    expect(sectionsAttempts("slower", "2")).toEqual(["1", "2"]);
  });

  it("takes only a pass as the green of the clean arm, and not a text that says it does not pass", () => {
    expect(judge(read({ exit: 0, text: passed }), SECTIONS_WANT.clean).ok).toBe(true);
    expect(judge(read({ exit: 0, text: `${unread} A run that cannot decide does not pass.` }), SECTIONS_WANT.clean).ok).toBe(false);
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
    const table = flipTable({ schema: SCHEMA, check: "heap", arms: [clean, fault], passed: true, outcome: "pass", env: {} as never });
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
