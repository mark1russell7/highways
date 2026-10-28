import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { defineStrategy, findStrategy, getStrategy } from "../../strategies/model.ts";
import { canonicalJson, documentHash, fnv1a32, mulberry32, round3, sha256Hex, stepSeed } from "./hash.ts";
import { rectScattered } from "./generators.ts";
import { formatInput, graphInput, inputGraph, parseLines, recordLines, type LayoutInput, type LayoutRecord } from "./forms.ts";
import { MEASURES, measureByKey } from "./measures.ts";
import { formatScreen, screen, SCREEN_RULES } from "./screen.ts";
import { corpusManifest, SCREEN_V1, screenInputs, type LayoutCorpus } from "./set.ts";

const inputs = screenInputs();
const tiny = inputs.find((i) => i.id === "screen-v1/tiny-uniform/s0")!;
const strip = ({ ms: _ms, ...rest }: LayoutRecord) => rest;

describe("the hash of an input", () => {
  it("gives the SHA-256 of Node for each length and for text out of ASCII", () => {
    for (const text of ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "a".repeat(1000), "Fréchet ↓ 😀"])
      expect(sha256Hex(text)).toBe(createHash("sha256").update(text, "utf8").digest("hex"));
  });

  it("writes canonical JSON: sorted keys, no whitespace, no undefined", () => {
    expect(canonicalJson({ b: [1, { d: 2, c: undefined }], a: "x" })).toBe('{"a":"x","b":[1,{"d":2}]}');
  });

  it("gives a fixed hash for a known input, without the field hash, in any key order", () => {
    const known = {
      schema: "layout-input/1",
      id: "screen-v1/known/s0",
      set: "screen-v1",
      family: "known",
      seed: 0,
      source: "made-up",
      generator: null,
      boxes: [
        { id: "a", w: 120, h: 40, x: 0, y: 0 },
        { id: "b", w: 80, h: 30, x: 200, y: 0, ports: [{ id: "out", side: "left" }] },
      ],
      edges: [{ id: "e1", source: "a", target: "b", targetPort: "out" }],
    };
    expect(documentHash(known)).toBe("e7cc5465db656865");
    expect(documentHash({ ...known, hash: "anything" })).toBe("e7cc5465db656865");
    const reversed = Object.fromEntries(Object.entries(known).reverse());
    expect(documentHash(reversed)).toBe("e7cc5465db656865");
    expect(documentHash({ ...known, seed: 1 })).not.toBe("e7cc5465db656865");
  });
});

describe("the generators (layout-corpus/1)", () => {
  it("gives the check value of fnv1a32 and the step seed of packing", () => {
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("1:container")).toBe(3139901265);
    expect(stepSeed(1, "container")).toBe(3139901265);
  });

  it("gives the same numbers of mulberry32 for the same seed, from 0 to below 1", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("rounds to 3 decimals and writes -0 as 0", () => {
    expect(round3(1.23456)).toBe(1.235);
    expect(round3(-0.0001)).toBe(0);
    expect(Object.is(round3(-0), 0)).toBe(true);
  });

  it("gives the hashes of packing for rect-scattered, version 1, with 40 boxes", () => {
    const pins = [
      { seed: 1, w: 970, h: 705, n: 4, hash: "f5f5c51d1560e41c" },
      { seed: 2, w: 733, h: 437, n: 7, hash: "cfd6ef0ef232aaa3" },
      { seed: 3, w: 871, h: 554, n: 8, hash: "d1638f2406360b2e" },
    ];
    for (const p of pins) {
      const input = rectScattered(p.seed, { count: 40 });
      expect(input.container).toEqual({ w: p.w, h: p.h, fixed: "size" });
      expect(input.obstacles).toHaveLength(p.n);
      expect(input.boxes).toHaveLength(40);
      expect(input.hash).toBe(p.hash);
      expect(documentHash(input)).toBe(p.hash);
      expect(rectScattered(p.seed, { count: 40 }).hash).toBe(p.hash);
    }
    expect(rectScattered(1, { count: 40 }).obstacles?.[0]).toEqual({ id: "o0", region: { kind: "rect", x: 690, y: 281, w: 111, h: 100 } });
  });
});

describe("the input files (layout-input/1)", () => {
  it("gives the screen set screen-v1: 14 boards from 10 to 150 nodes", () => {
    expect(inputs.map((i) => i.id)).toEqual(SCREEN_V1.families.flatMap((f) => Array.from({ length: f.seeds }, (_, k) => `screen-v1/${f.name}/s${k}`)));
    expect(inputs).toHaveLength(14);
    const sizes = inputs.map((i) => i.boxes.length);
    expect(Math.min(...sizes)).toBe(10);
    expect(Math.max(...sizes)).toBe(150);
    for (const i of inputs) expect(i.hash).toBe(documentHash(i));
  });

  it("gives back the same graph of the router, with the fixed plugs", () => {
    // JSON writes -0 as 0, so the comparison reads the graph through JSON.
    for (const [f, family] of SCREEN_V1.families.entries())
      for (let k = 0; k < family.seeds; k++) {
        const input = inputs.find((i) => i.id === `screen-v1/${family.name}/s${k}`)!;
        expect(inputGraph(input), `${f} ${k}`).toEqual(JSON.parse(JSON.stringify(family.make(k))));
        expect(graphInput(inputGraph(input), input)).toEqual(input);
      }
    expect(inputs.some((i) => i.boxes.some((b) => b.ports?.some((p) => p.side !== undefined && p.x !== undefined)))).toBe(true);
  });

  it("ignores the fields of the packer, and refuses a box without a position", () => {
    const packed: LayoutInput = { ...tiny, container: { w: 800, fixed: "width" }, gap: 4, boxes: tiny.boxes.map((b, i) => ({ ...b, rank: i, locked: true as const })) };
    expect(inputGraph(packed)).toEqual(inputGraph(tiny));
    const { x: _x, ...loose } = tiny.boxes[0]!;
    expect(() => inputGraph({ ...tiny, boxes: [loose, ...tiny.boxes.slice(1)] })).toThrow(/no position/);
  });

  it("gives the router each obstacle as a box without edges, and ignores the shapes", () => {
    const shaped: LayoutInput = {
      ...tiny,
      container: { fixed: "none", aspect: 1.5, shape: { kind: "circle", cx: 0, cy: 0, r: 900 } },
      boxes: tiny.boxes.map((b) => ({ ...b, shape: { kind: "ellipse" as const, cx: b.w / 2, cy: b.h / 2, rx: b.w / 2, ry: b.h / 2 } })),
      obstacles: [
        { id: "lake", region: { kind: "polygon", points: [[10, 20], [60, 5], [40, 70]], holes: [[[30, 30], [35, 30], [32, 35]]] }, move: { cost: 3 } },
        { id: "rock", region: { kind: "circle", cx: 100, cy: 100, r: 5 } },
      ],
    };
    const graph = inputGraph(shaped);
    const plain = inputGraph(tiny);
    expect(graph.nodes.slice(0, plain.nodes.length)).toEqual(plain.nodes);
    expect(graph.nodes.slice(plain.nodes.length)).toEqual([
      { id: "lake", box: { x: 10, y: 5, w: 50, h: 65 } },
      { id: "rock", box: { x: 95, y: 95, w: 10, h: 10 } },
    ]);
    expect(graph.edges).toEqual(plain.edges);
  });

  it("matches the files in corpus/screen-v1", () => {
    const root = new URL("../../../../../corpus/screen-v1/", import.meta.url);
    for (const input of inputs) {
      const file = JSON.parse(readFileSync(new URL(`${input.family}/s${input.seed}.json`, root), "utf8")) as LayoutInput;
      expect(file, input.id).toEqual(input);
      expect(documentHash(file)).toBe(file.hash);
      expect(JSON.parse(formatInput(input))).toEqual(input);
    }
    const manifest = JSON.parse(readFileSync(new URL("corpus.json", root), "utf8")) as LayoutCorpus;
    expect(manifest).toEqual(corpusManifest("screen-v1", inputs));
  });

  it("gives each input its generator and its cell, and the manifest lists each seed of each generator", () => {
    for (const input of inputs) {
      expect(input.generator, input.id).not.toBeNull();
      expect(input.cell?.edgeShape, input.id).toBeDefined();
    }
    const manifest = corpusManifest("screen-v1", inputs);
    expect(manifest.schema).toBe("layout-corpus/1");
    expect(manifest.inputs.map((i) => i.hash)).toEqual(inputs.map((i) => i.hash));
    expect(manifest.specs.reduce((n, s) => n + s.seeds.length, 0)).toBe(14);
    expect(inputs.find((i) => i.family === "small-clustered")?.cell?.ports).toBe("fixed");
  });
});

describe("the measure table", () => {
  it("gives each measure one key, one name, a unit, a better side and the placement dependence", () => {
    expect(new Set(MEASURES.map((m) => m.key)).size).toBe(MEASURES.length);
    expect(new Set(MEASURES.map((m) => m.name)).size).toBe(MEASURES.length);
    for (const m of MEASURES) {
      expect(m.name).toMatch(/^route(\.[a-z0-9-]+)+$/);
      expect(m.id).toMatch(/^[RBCGZMW]\d+$/);
      expect(m.unit.length).toBeGreaterThan(0);
      expect(["lower", "higher"]).toContain(m.better);
      expect(typeof m.placementDependent).toBe("boolean");
    }
    // The crossings depend on the positions of the boxes. The detour of a route is a ratio to its span, so it does not.
    expect(measureByKey("R1.crossings")?.placementDependent).toBe(true);
    expect(measureByKey("R5.median")?.placementDependent).toBe(false);
    expect(measureByKey("C2.median")?.placementDependent).toBe(false);
  });
});

describe("screen", () => {
  const one = screen("router", ["corners"], { inputs: [tiny], baseline: false, commit: "abc1234" });

  it("writes one record for each run, with the step, the strategy, the input, the seed, each measure and the time", () => {
    expect(one.records).toHaveLength(1);
    const r = one.records[0]!;
    expect(r).toMatchObject({ schema: "layout-record/1", stage: "route", step: "router", strategy: "corners", corpus: "screen-v1", set: "screen-v1", input: tiny.id, inputHash: tiny.hash, seed: 0, nodes: 10, edges: 15, deterministic: true, commit: "abc1234" });
    expect(Object.keys(r.hard)).toEqual([...SCREEN_RULES.router]);
    expect(Object.values(r.hard).every((v) => v === 0)).toBe(true);
    expect(r.ms).toBeGreaterThanOrEqual(0);
    expect(r.measures["ms"]).toBeUndefined();
    for (const name of ["route.crossings", "route.detour.median", "route.bends", "route.clearance.mean", "route.stability.mean"]) expect(typeof r.measures[name], name).toBe("number");
    expect(Object.keys(r.measures).filter((k) => k.startsWith("route.other."))).toEqual([]);
    expect(parseLines<LayoutRecord>(recordLines(one.records))).toEqual(one.records);
  });

  it("gives the same records for the same input, apart from the time", () => {
    const again = screen("router", ["corners"], { inputs: [tiny], baseline: false, commit: "abc1234" });
    expect(again.records.map(strip)).toEqual(one.records.map(strip));
  });

  it("writes the bundle measures B2, B3 and B6 for each router record", () => {
    const m = one.records[0]!.measures;
    for (const name of ["route.bundle.share", "route.bundle.stretch.median", "route.bundle.stretch.q95", "route.bundle.merge-angle.max"]) expect(m[name]).toBeTypeOf("number");
    // The base of the bundle stretch is the routes of corners, so corners has a stretch of 1.
    expect(m["route.bundle.stretch.median"]).toBe(1);
  });

  it("writes the measures of MEAS3A for each router record", () => {
    const r = one.records[0]!;
    const names = ["route.lane.separation", "route.orthogonality", "route.bundle.lane-crossings", "route.bundle.occupied-area", "route.bundle.runs", "route.bundle.run-edges.median", "route.bundle.run-edges.max", "route.lane.area", "route.lane.through", "route.level.link-ends"];
    for (const name of names) expect(r.measures[name], name).toBeTypeOf("number");
    // corners gives no run, so it has no lane to open, no lane fidelity and no lane crossing.
    expect(r.measures["route.bundle.runs"]).toBe(0);
    expect(r.measures["route.bundle.lane-crossings"]).toBe(0);
    expect(r.measures["route.bundle.lane-fidelity.median"]).toBeUndefined();
    expect(r.measures["route.level.link-ends"]).toBe(r.hard["link-ends"]);
  });

  it("counts the breaks of `link-ends` as Z2, and gives Z9 for a result with zoom levels", () => {
    const corners = getStrategy(STRATEGIES, "router", "corners");
    // One level with two groups: the first two nodes in the box of the first node, and the other nodes in the box of the third node.
    // The link joins the centers of the two boxes, so it breaks `link-ends`.
    const proto = defineStrategy({
      step: "router",
      name: "proto-levels",
      describe: "corners, with one level whose link starts and ends inside its items.",
      defaults: {},
      run: (graph) => {
        const result = corners.run(graph);
        const [a, , c] = graph.nodes;
        const items = [
          { id: "g1", box: a!.box, nodes: graph.nodes.slice(0, 2).map((n) => n.id) },
          { id: "g2", box: c!.box, nodes: graph.nodes.slice(2).map((n) => n.id) },
        ];
        const mid = (b: (typeof items)[number]["box"]) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
        return { ...result, levels: [{ depth: 0, items, links: [{ source: "g1", target: "g2", count: 1, points: [mid(a!.box), mid(c!.box)] }] }] };
      },
    });
    const m = screen("router", [proto], { inputs: [tiny], baseline: false }).records[0]!.measures;
    expect(m["route.level.link-ends"]).toBe(1);
    expect(m["route.level.link-agreement"]).toBeTypeOf("number");
    expect(one.records[0]!.measures["route.level.link-agreement"]).toBeUndefined();
  });

  it("adds the wrapped routers of `wrap`, and the order fragility of `shuffles`", () => {
    const report = screen("router", ["corners"], { inputs: [tiny], baseline: false, wrap: ["stable", "repair"], shuffles: 3 });
    expect(report.records.map((r) => r.strategy)).toEqual(["corners", "corners+stable", "corners+repair"]);
    for (const r of report.records) {
      expect(r.measures["route.order.changed"]).toBe(0);
      expect(r.measures["route.order.crossings"]).toBe(0);
    }
    expect(report.summary.strategies.filter((s) => s.candidate).map((s) => s.strategy)).toEqual(["corners", "corners+stable", "corners+repair"]);
    expect(one.records[0]!.measures["route.order.changed"]).toBeUndefined();
    expect(findStrategy(STRATEGIES, "router", "corners+stable")).toBeUndefined();
  });

  it("screens a strategy that is not in the registry, and leaves the registry as it is", () => {
    const corners = getStrategy(STRATEGIES, "router", "corners");
    const proto = defineStrategy({ step: "router", name: "proto-corners", describe: "A copy of corners.", defaults: {}, run: (graph) => corners.run(graph) });
    const report = screen("router", [proto], { inputs: [tiny], baseline: false });
    expect(report.records.map((r) => r.strategy)).toEqual(["proto-corners"]);
    expect(report.records[0]!.measures).toEqual(one.records[0]!.measures);
    expect(findStrategy(STRATEGIES, "router", "proto-corners")).toBeUndefined();
    expect(() => screen("router", [{ ...proto, name: "corners" }], { inputs: [tiny] })).toThrow(/built-in/);
  });

  it("compares the new strategies with the built-in strategies of the step", () => {
    const proto = defineStrategy({ step: "router", name: "proto-straight", describe: "A copy of straight.", defaults: {}, run: (graph) => getStrategy(STRATEGIES, "router", "straight").run(graph) });
    const { summary } = screen("router", [proto], { inputs: [tiny] });
    const row = summary.strategies.find((s) => s.strategy === "proto-straight")!;
    expect(row.candidate).toBe(true);
    expect(summary.strategies.filter((s) => s.candidate)).toHaveLength(1);
    expect(summary.strategies.length).toBe(STRATEGIES.router.length + 1);
    // The straight lines go through boxes, so the copy breaks a hard rule and does not enter the front.
    expect(row.hard["no-pass-through"]).toBeGreaterThan(0);
    expect(summary.excluded).toContain("proto-straight");
    expect(summary.front).toContain("corners");
    expect(formatScreen(summary)).toContain("| proto-straight | yes |");
  });

  it("keeps the breaks that each built-in has on a board out of the gate of the front", () => {
    // On the packed grid, the boxes touch, so each router goes through boxes.
    const packed = inputs.find((i) => i.id === "screen-v1/packed-grid/s0")!;
    const { summary } = screen("router", ["corners", "straight"], { inputs: [packed], baseline: false });
    const corners = summary.strategies.find((s) => s.strategy === "corners")!;
    expect(corners.hardTotal).toBeGreaterThan(0);
    expect(corners.hardOverFloor).toBe(corners.hardTotal);
    const all = screen("router", [], { inputs: [packed] }).summary;
    const base = all.strategies.find((s) => s.strategy === "corners")!;
    expect(base.hardTotal).toBe(corners.hardTotal);
    expect(base.hardOverFloor).toBe(0);
    // Each built-in breaks no-pass-through on this board, so the front is not empty. plugs breaks the rule more often than the floor.
    expect(all.front.length).toBeGreaterThan(0);
    expect(all.excluded).toEqual(["plugs"]);
  });

  it("screens a curve and a grouping rule, and checks that each runs the same two times", () => {
    const curve = screen("curve", ["rounded"], { inputs: [tiny], baseline: false }).records[0]!;
    expect(curve.deterministic).toBe(true);
    expect(curve.hard).toEqual({ "same-twice": 0 });
    expect(typeof curve.measures["route.curve.c2.median"]).toBe("number");
    const group = screen("group", ["quadtree"], { inputs: [tiny], baseline: false }).records[0]!;
    expect(group.deterministic).toBe(true);
    expect(Object.keys(group.hard)).toEqual([...SCREEN_RULES.group]);
    expect(Object.keys(group.measures).filter((k) => k.startsWith("route.other."))).toEqual([]);
  });

  it("screens the highway strategies with follow, after the base routers (HWY-STEP)", () => {
    const { records, summary } = screen("highway", [], { inputs: [tiny] });
    expect(records.map((r) => [r.step, r.strategy])).toEqual([
      ["router", "corners"],
      ["router", "shared"],
      ["router", "trunks"],
      ["highway", "keys"],
      ["highway", "shared-ways"],
      ["highway", "corridors"],
      ["highway", "meet"],
      ["highway", "weiszfeld"],
      ["highway", "stubs"],
      ["highway", "zipper"],
      ["highway", "level-links"],
      ["highway", "quickbundles"],
      ["highway", "road-classes"],
      ["highway", "flow-field"],
      ["highway", "wspd"],
      ["highway", "od-cells"],
      ["highway", "select"],
      ["highway", "mingle"],
      ["highway", "spiral"],
      ["highway", "flow-clusters"],
      ["highway", "traclus"],
      ["highway", "diffusion"],
      ["highway", "nested"],
      ["highway", "lanes"],
      ["highway", "growth"],
      ["highway", "edge-paths"],
      ["highway", "soft-keys"],
      ["highway", "hough"],
      ["highway", "ridges"],
      ["highway", "hdbscan"],
      ["highway", "hub-arcs"],
      ["highway", "divided"],
      ["highway", "hierarchy"],
      ["highway", "fdeb"],
      ["highway", "mesh"],
      ["highway", "kdeeb"],
      ["highway", "cubu"],
      ["highway", "mlseb"],
      ["highway", "sbeb"],
      ["highway", "areas"],
      ["highway", "confluent"],
      ["highway", "power"],
      ["highway", "crossbars"],
      ["highway", "frechet"],
      ["highway", "corridors+breakeven"],
      ["highway", "corridors+stretch"],
      ["highway", "corridors+ambiguity"],
      ["highway", "corridors+hysteresis"],
      ["highway", "corridors+ids"],
    ]);
    for (const r of records.filter((x) => x.step === "highway")) {
      expect(Object.keys(r.hard), r.strategy).toEqual([...SCREEN_RULES.highway]);
      expect(r.deterministic, r.strategy).toBe(true);
      for (const name of ["route.ink", "route.crossings", "route.bends"]) expect(typeof r.measures[name], `${r.strategy} ${name}`).toBe("number");
    }
    expect(summary.step).toBe("highway");
    expect(summary.strategies.filter((s) => s.candidate)).toEqual([]);
    expect(formatScreen(summary)).toContain("## Screen of the step `highway`");
  });

  it("measures the highway strategies over a sequence of seeded edits, only with the option edits (HWY-046, HWY-054)", () => {
    const plain = screen("highway", ["corridors"], { inputs: [tiny], baseline: false, baseRouters: [] }).records[0]!;
    expect(plain.measures["route.stability.highway-churn"]).toBeUndefined();
    const { records } = screen("highway", ["corridors", "corridors+ids"], { inputs: [tiny], baseline: false, baseRouters: [], edits: 2 });
    for (const r of records) {
      for (const name of ["route.stability.edits.mean", "route.stability.edits.moved", "route.stability.highway-churn"]) expect(typeof r.measures[name], `${r.strategy} ${name}`).toBe("number");
    }
    const [corridors, ids] = records;
    // The gate ids changes only the ids, so the routes and the pairs of edges do not change.
    expect(ids!.measures["route.stability.edits.mean"]).toBe(corridors!.measures["route.stability.edits.mean"]);
    expect(ids!.measures["route.stability.highway-churn"]).toBe(corridors!.measures["route.stability.highway-churn"]);
  });

  it("screens a new highway strategy alone, without base routers", () => {
    const corridors = getStrategy(STRATEGIES, "highway", "corridors");
    const proto = defineStrategy({ step: "highway", name: "proto-corridors", describe: "A copy of corridors.", defaults: corridors.defaults, run: (input, o) => corridors.run(input, o) });
    const { records, summary } = screen("highway", [proto], { inputs: [tiny], baseline: false, baseRouters: [] });
    expect(records.map((r) => r.strategy)).toEqual(["proto-corridors"]);
    expect(summary.strategies[0]!.candidate).toBe(true);
    expect(findStrategy(STRATEGIES, "highway", "proto-corridors")).toBeUndefined();
  });

  it("compares a variant with its base", () => {
    const variant: LayoutInput = { ...tiny, id: "screen-v1/tiny-uniform/s0-same", base: tiny.id, change: "reorder", hash: "" };
    const records = screen("router", ["corners"], { inputs: [tiny, { ...variant, hash: documentHash(variant) }], baseline: false }).records;
    expect(records[0]!.measures["route.stability.base.mean"]).toBeUndefined();
    expect(records[1]!.measures["route.stability.base.mean"]).toBe(0);
    expect(records[1]!.measures["route.stability.base.moved"]).toBe(0);
  });

  it("joins the predictions to the records", () => {
    const crossings = one.records[0]!.measures["route.crossings"]!;
    const predictions = [
      { id: "p-one", strategy: "corners", set: "screen-v1", input: tiny.id, measure: "route.crossings", expected: crossings, reason: "The same board as before." },
      { id: "p-median", strategy: "corners", set: "screen-v1", measure: "route.detour.median", expected: 1, op: "<" as const, reason: "A detour is never below 1." },
    ];
    const report = screen("router", ["corners"], { inputs: [tiny], baseline: false, predictions });
    expect(report.records[0]!.prediction).toBe("p-one");
    expect(report.summary.predictions.map((p) => [p.id, p.op, p.met])).toEqual([
      ["p-one", "<=", true],
      ["p-median", "<", false],
    ]);
    expect(formatScreen(report.summary)).toContain("| p-one | corners |");
  });
});
