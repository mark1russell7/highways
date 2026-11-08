import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { distinctCount, distinctness, type RouteHashes } from "./distinct.ts";

const BOARDS = ["b1", "b2", "b3"];
const REFUSED = "refused";
const s = (id: string, stage: string, hashes: readonly (string | undefined)[]): RouteHashes => ({
  id,
  stage,
  boards: Object.fromEntries(BOARDS.flatMap((b, i) => (hashes[i] === undefined ? [] : [[b, hashes[i]!]]))),
});
const gate = (operators: readonly RouteHashes[], variants: readonly RouteHashes[]) => distinctness(operators, variants, { boards: BOARDS, refused: REFUSED });
const OPS = [s("op-a", "highway", ["a1", "a2", "a3"]), s("op-b", "highway", ["b1", "b2", "b3"]), s("op-r", "router", ["r1", "r2", "r3"])];

describe("distinctness", () => {
  it("gives distinct when a board differs from each operator of the stage, and names that board", () => {
    const [row] = gate(OPS, [s("v", "highway", ["a1", "x2", "b3"])]);
    expect(row).toMatchObject({ verdict: "distinct", sameAs: [], undecided: [], missing: [], differsOn: { "op-a": "b2", "op-b": "b1" } });
  });

  it("gives same when an operator has the same hash on each board", () => {
    const [row] = gate(OPS, [s("v", "highway", ["b1", "b2", "b3"])]);
    expect(row).toMatchObject({ verdict: "same", sameAs: ["op-b"], differsOn: { "op-a": "b1" } });
  });

  it("compares a variant only with the operators of its stage", () => {
    const [row] = gate(OPS, [s("v", "router", ["a1", "a2", "a3"])]);
    expect(row).toMatchObject({ verdict: "distinct", differsOn: { "op-r": "b1" } });
    expect(gate([], [s("w", "curve", ["c1", "c2", "c3"])])[0]!.verdict).toBe("distinct");
  });

  it("gives no-read for a variant with no hash on a board of the set", () => {
    const [row] = gate(OPS, [s("v", "highway", ["x1", undefined, "x3"])]);
    expect(row).toMatchObject({ verdict: "no-read", missing: ["b2"] });
  });

  it("does not count a refused board as a difference", () => {
    // Each board where the variant differs from op-a is refused, so the gate cannot decide against op-a.
    const [row] = gate(OPS, [s("v", "highway", [REFUSED, REFUSED, REFUSED])]);
    expect(row).toMatchObject({ verdict: "no-read", undecided: ["op-a", "op-b"], differsOn: {} });
    const [partial] = gate(OPS, [s("w", "highway", [REFUSED, "x2", "x3"])]);
    expect(partial).toMatchObject({ verdict: "distinct", differsOn: { "op-a": "b2", "op-b": "b2" } });
  });

  it("gives no-read against an operator with a board that has no hash, unless another board differs", () => {
    const op = s("op-c", "curve", ["c1", undefined, "c3"]);
    expect(gate([op], [s("v", "curve", ["c1", "x2", "c3"])])[0]).toMatchObject({ verdict: "no-read", undecided: ["op-c"] });
    expect(gate([op], [s("w", "curve", ["c1", "x2", "x3"])])[0]).toMatchObject({ verdict: "distinct", differsOn: { "op-c": "b3" } });
  });

  it("gives each variant of a class with the same hashes the first id of the class, and counts the class once", () => {
    const rows = gate(OPS, [s("v2", "highway", ["x1", "x2", "x3"]), s("v1", "highway", ["x1", "x2", "x3"]), s("v3", "router", ["x1", "x2", "x3"]), s("v4", "highway", ["a1", "a2", "a3"])]);
    expect(rows.map((r) => [r.id, r.verdict, r.canonical])).toEqual([
      ["v1", "distinct", "v1"],
      ["v2", "distinct", "v1"],
      ["v3", "distinct", "v3"],
      ["v4", "same", "v4"],
    ]);
    expect(distinctCount(rows)).toBe(2);
  });

  it("gives the same rows for any order of the inputs", () => {
    const variants = [s("v2", "highway", ["x1", "x2", "x3"]), s("v1", "highway", ["x1", "y2", "x3"]), s("v3", "highway", ["b1", "b2", "b3"])];
    expect(gate([...OPS].reverse(), [...variants].reverse())).toEqual(gate(OPS, variants));
  });

  it("refuses an id that is not unique, and a set with no board", () => {
    expect(() => gate(OPS, [s("op-a", "highway", ["x1", "x2", "x3"])])).toThrow("op-a");
    expect(() => distinctness(OPS, [], { boards: [] })).toThrow("no board");
  });

  // The gate moves whole into the package `strategy-space`, so it imports nothing.
  it("imports nothing", () => {
    const source = readFileSync(new URL("./distinct.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(|\bimport\(/);
  });
});
