import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { diffInputs, InputError, parseList, requireGrid, requireInputs } from "./inputs.ts";

const cli = fileURLToPath(new URL("./inputs.ts", import.meta.url));
const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });

describe("requireInputs", () => {
  it("passes when the lists hold the same items in any order", () => {
    expect(() => requireInputs("t", ["a", "b"], ["b", "a"])).not.toThrow();
  });

  it("fails on an empty input, and names each missing item", () => {
    expect(() => requireInputs("t", ["a", "b"], [])).toThrow(/expected 2 inputs and got 0\. Missing: a, b\./);
  });

  it("fails when one input is missing, and names it", () => {
    expect(() => requireInputs("t", ["a", "b", "c"], ["a", "c"])).toThrow(/Missing: b\./);
  });

  it("fails on an input that is not in the plan", () => {
    expect(() => requireInputs("t", ["a"], ["a", "z"])).toThrow(/Not in the plan: z\./);
  });

  it("fails when the plan expects no input, so a test over nothing cannot pass", () => {
    expect(() => requireInputs("t", [], [])).toThrow(InputError);
    expect(() => requireInputs("t", 0, 0)).toThrow(/A gate needs 1 or more/);
  });

  it("compares two counts", () => {
    expect(() => requireInputs("t", 16, 16)).not.toThrow();
    expect(() => requireInputs("t", 16, 15)).toThrow(/expected 16 inputs and got 15/);
    expect(() => requireInputs("t", 16, Number.NaN)).toThrow(InputError);
  });

  it("shows at most 12 missing items", () => {
    const expected = Array.from({ length: 20 }, (_, i) => `i${i}`);
    expect(() => requireInputs("t", expected, [])).toThrow(/i11 and 8 more\./);
  });
});

describe("diffInputs and parseList", () => {
  it("gives the missing and the extra items", () => {
    expect(diffInputs(["a", "b"], ["b", "c"])).toEqual({ missing: ["a"], extra: ["c"] });
  });

  it("reads commas, spaces and new lines", () => {
    expect(parseList(" a,b c\nd ,")).toEqual(["a", "b", "c", "d"]);
  });
});

describe("requireGrid", () => {
  const rec = (strategy: string, input: string) => ({ strategy, input });

  it("passes on a full grid", () => {
    expect(() => requireGrid("t", [rec("s", "1"), rec("s", "2"), rec("u", "2"), rec("u", "1")])).not.toThrow();
  });

  it("fails on no record", () => {
    expect(() => requireGrid("t", [])).toThrow(/there is no record/);
  });

  it("fails when one strategy has no record on one input, and names both", () => {
    expect(() => requireGrid("t", [rec("s", "1"), rec("s", "2"), rec("u", "1")])).toThrow(/the strategy u: .*Missing: 2\./);
  });
});

describe("the command", () => {
  it("exits 0 when the lists agree", () => {
    const r = run("t", "--expect", "a,b", "--got", "b a");
    expect(r.status).toBe(0);
  });

  it("exits 1 on an empty input, and names the missing items", () => {
    const r = run("shards", "--expect", "0,1", "--got", "");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("::error::shards: the gate expected 2 inputs and got 0. Missing: 0, 1.");
  });

  it("exits 1 when one input is missing", () => {
    const r = run("shards", "--expect", "0,1,2", "--got", "0\n2");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("Missing: 1.");
  });

  it("exits 1 when the counts differ, or when a count is empty", () => {
    expect(run("stops", "--expect-count", "16", "--got-count", "15").status).toBe(1);
    expect(run("stops", "--expect-count", "16", "--got-count", "").status).toBe(1);
    expect(run("stops", "--expect-count", "16", "--got-count", "16").status).toBe(0);
  });

  it("exits 2 with no name or no list", () => {
    expect(run("--expect", "a").status).toBe(2);
    expect(run("t", "--expect", "a").status).toBe(2);
  });
});
