import { describe, expect, it } from "vitest";
import { follow } from "../../highways/follow.ts";
import type { HighwayPlan } from "../../highways/model.ts";
import { asRouter, getStrategy } from "../../strategies/model.ts";
import { highwayStrategies, STRATEGIES } from "../../strategies/builtins.ts";
import { exercised, outputGroups, outputHash } from "./activation.ts";
import { activationBase, activationReport, finderOf, planMoves, resultHash } from "./exercise.ts";
import { inputGraph, type LayoutRecord } from "./forms.ts";
import { canonicalJson, RECORD_EPS, round3, sha256Hex } from "./hash.ts";
import { screen } from "./screen.ts";
import { screenInputs } from "./set.ts";

describe("outputHash", () => {
  it("gives the first 16 hex characters of the SHA-256 of the canonical JSON", () => {
    const value = { b: [1, 2], a: "x" };
    expect(outputHash(value)).toBe(sha256Hex(canonicalJson(value)).slice(0, 16));
    expect(outputHash(value)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("does not read the order of the keys", () => {
    expect(outputHash({ a: 1, b: { c: 2, d: 3 } })).toBe(outputHash({ b: { d: 3, c: 2 }, a: 1 }));
  });

  it("keeps the numbers exact without a grid", () => {
    expect(outputHash({ x: 1.0001 })).not.toBe(outputHash({ x: 1 }));
  });

  it("puts each number on the grid RECORD_EPS as round3 does, and changes -0 to 0", () => {
    const grid = { grid: RECORD_EPS };
    expect(outputHash({ x: 1.0001 }, grid)).toBe(outputHash({ x: 1 }, grid));
    expect(outputHash({ x: 1.002 }, grid)).not.toBe(outputHash({ x: 1 }, grid));
    expect(outputHash([-0.0001, -0], grid)).toBe(outputHash([0, 0]));
    for (const v of [0.0005, 1.2345, -2.0004, 123.4565, 7.0015]) expect(outputHash(v, grid)).toBe(outputHash(round3(v)));
  });
});

describe("outputGroups", () => {
  it("groups the candidates with the same list of hashes, in the order of the first candidate", () => {
    const groups = outputGroups({ c: ["h1", "h2"], a: ["h1", "h2"], b: ["h1", "h3"], d: ["h1", "h3"], e: ["h9", "h2"] });
    expect(groups).toEqual([
      { id: "a", members: ["a", "c"] },
      { id: "b", members: ["b", "d"] },
      { id: "e", members: ["e"] },
    ]);
  });

  it("splits two candidates that differ on one input only", () => {
    expect(outputGroups({ a: ["x", "y"], b: ["x", "z"] }).length).toBe(2);
  });
});

describe("exercised", () => {
  it("is true when a move count is above 0", () => {
    expect(exercised({ moves: { "move.powerEdge": 1 } })).toBe(true);
    expect(exercised({ moves: [{ "move.powerEdge": 0 }, { "move.powerEdge": 2 }] })).toBe(true);
  });

  it("is true when a hash differs from the base hash", () => {
    expect(exercised({ hashes: ["a", "b"], baseHashes: ["a", "c"] })).toBe(true);
  });

  it("is false with no move and the same output as the base on each input", () => {
    expect(exercised({ moves: { "move.powerEdge": 0 }, hashes: ["a", "b"], baseHashes: ["a", "b"] })).toBe(false);
    expect(exercised({})).toBe(false);
  });

  it("does not count an input without a hash", () => {
    expect(exercised({ hashes: ["a", undefined], baseHashes: ["a", "b"] })).toBe(false);
  });
});

describe("the highways form", () => {
  const tiny = screenInputs().find((i) => i.id === "screen-v1/tiny-uniform/s0")!;
  const graph = inputGraph(tiny);

  it("gives the same hash for the same routes in another order", () => {
    const result = asRouter(getStrategy(STRATEGIES, "router", "corners")).route(graph);
    expect(resultHash({ ...result, routes: [...result.routes].reverse() })).toBe(resultHash(result));
  });

  it("gives the empty plan the hash of each finder that makes no highway", () => {
    const empty: HighwayPlan = { highways: [] };
    expect(resultHash(follow(graph, empty))).toBe(resultHash(follow(graph, { highways: [] })));
    expect(planMoves("hw:power", empty)).toEqual({ "move.powerEdge": 0 });
  });

  it("counts the highways of a plan with 2 edges or more as the own move", () => {
    const plan = highwayStrategies["shared-ways"].run({ graph }, highwayStrategies["shared-ways"].defaults);
    const moves = planMoves("hw:shared-ways", plan)!;
    expect(moves["move.sharedWay"]).toBe(plan.highways.filter((h) => h.members.length >= 2).length);
  });

  it("gives no move count to a gate or a plan changer", () => {
    expect(planMoves("w3e:power+stretch", { highways: [] })).toBeUndefined();
    expect(planMoves("hw:weiszfeld", { highways: [] })).toBeUndefined();
  });

  it("finds the finder of a variant", () => {
    expect(finderOf("w3e:power-near")).toBe("power");
    expect(finderOf("w3a:flow-clusters-t0.15")).toBe("flow-clusters");
    expect(finderOf("w3f:w3f-nested-l1")).toBe("nested");
    expect(finderOf("shared-cap-3")).toBeUndefined();
  });

  it("gives the base of each kind of strategy", () => {
    const known = new Set(["hw:none", "hw:power", "hw:shared-ways", "hw:corridors", "shared", "shared-all", "trunks", "corners", "w2a:corridors-min3"]);
    expect(activationBase("hw:power", known)).toBe("hw:none");
    expect(activationBase("w3e:power-near", known)).toBe("hw:none");
    expect(activationBase("w3e:power+stretch", known)).toBe("hw:power");
    expect(activationBase("hw:weiszfeld", known)).toBe("hw:shared-ways");
    expect(activationBase("w2b:meet-corridors", known)).toBe("hw:corridors");
    expect(activationBase("w2b:stubs-none", known)).toBe("hw:none");
    expect(activationBase("shared-cap-3", known)).toBe("shared");
    expect(activationBase("shared-all-p3", known)).toBe("shared-all");
    expect(activationBase("trunks-tree-bf02", known)).toBe("trunks");
    expect(activationBase("corners-side", known)).toBe("corners");
    expect(activationBase("shared+repair", known)).toBe("shared");
    expect(activationBase("shared", known)).toBeUndefined();
    expect(activationBase("hw:none", known)).toBeUndefined();
  });
});

describe("activationReport", () => {
  const record = (strategy: string, input: string, outputHash: string, moves?: number): LayoutRecord => ({
    schema: "layout-record/1",
    stage: "route",
    step: "router",
    strategy,
    options: {},
    corpus: "screen-v1",
    input,
    inputHash: "0",
    set: "screen-v1",
    seed: 0,
    nodes: 1,
    edges: 1,
    measures: {},
    hard: {},
    deterministic: true,
    ms: 0,
    outputHash,
    ...(moves === undefined ? {} : { trace: [{ id: "router", measures: { "move.powerEdge": moves } }] }),
  });
  const a = "screen-v1/hub-chain/s0";
  const b = "screen-v1/many-groups/s0";
  const c = "screen-v1/tiny-uniform/s0";
  const records = [
    record("hw:none", a, "n1"),
    record("hw:none", b, "n2"),
    record("hw:none", c, "n3"),
    // A silent finder: no move and the output of the empty plan on each decision input. It fires only on a board outside the decision.
    record("hw:power", a, "n1", 0),
    record("hw:power", b, "n2", 0),
    record("hw:power", c, "p3", 4),
    // Two finders with the same output on each decision input, different from the base.
    record("hw:spectral", a, "s1"),
    record("hw:spectral", b, "s2"),
    record("hw:resistance", a, "s1"),
    record("hw:resistance", b, "s2"),
  ];

  it("gives the verdict not-exercised only from the decision inputs", () => {
    const report = activationReport(records, { families: ["hub-chain", "many-groups"] });
    expect(report.inputs).toEqual([a, b]);
    const row = (s: string) => report.rows.find((r) => r.strategy === s)!;
    expect(row("hw:power")).toMatchObject({ base: "hw:none", inputs: 2, moved: [], differs: [], verdict: "not-exercised" });
    expect(row("hw:spectral")).toMatchObject({ verdict: "exercised", differs: [a, b] });
    expect(activationReport(records).rows.find((r) => r.strategy === "hw:power")!.verdict).toBe("exercised");
  });

  it("puts the strategies with equal output on each decision input in one group", () => {
    const report = activationReport(records, { families: ["hub-chain", "many-groups"] });
    expect(report.groups.map((g) => g.members)).toEqual([
      ["hw:none", "hw:power"],
      ["hw:resistance", "hw:spectral"],
    ]);
    expect(report.rows.find((r) => r.strategy === "hw:spectral")!.group).toBe("hw:resistance");
    expect(report.cells.map((c) => c.cell)).toEqual(["hub-chain", "many-groups"]);
  });
});

describe("the screen records", () => {
  const tiny = screenInputs().filter((i) => i.id === "screen-v1/tiny-uniform/s0");

  it("gives each record its output hash, and the same hash to the same output", () => {
    const { records } = screen("router", ["corners", "corners-smooth"], { inputs: tiny, baseline: false });
    for (const r of records) expect(r.outputHash).toMatch(/^[0-9a-f]{16}$/);
    const again = screen("router", ["corners"], { inputs: tiny, baseline: false }).records[0]!;
    expect(again.outputHash).toBe(records.find((r) => r.strategy === "corners")!.outputHash);
  });

  it("adds the move counts of `moves` to the trace of the record", () => {
    const { records } = screen("router", ["corners"], { inputs: tiny, baseline: false, moves: () => ({ "move.highway": 2 }) });
    expect(records[0]!.trace).toEqual([{ id: "router", measures: { "move.highway": 2 } }]);
  });
});
