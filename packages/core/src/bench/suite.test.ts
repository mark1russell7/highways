import { describe, expect, it } from "vitest";
import { FIXTURES, makeFixture } from "../fixtures.ts";
import { STRATEGIES } from "../strategies/builtins.ts";
import { listStrategies, routersOf } from "../strategies/model.ts";
import { benchOne } from "./run.ts";
import { familySeed, formatFronts, formatMeasureTime, formatRules, formatSummaries, joinReports, PROPOSED_RULES, runSuite } from "./suite.ts";

describe("runSuite (MEAS1)", () => {
  const tiny = FIXTURES.find((f) => f.name === "tiny-uniform")!;
  const { report, bench } = runSuite({ max: 20, seeds: 2, repeat: 2, fixtures: [tiny], roomFamilies: [{ name: "packed-small", cols: 4, rows: 3, long: 3 }] });
  const rows = (step: string) => report.rows.filter((r) => r.step === step);
  const strip = <T extends { ms: number }>({ ms: _ms, ...rest }: T) => rest;

  it("runs each fixture family over the seeds, and the first seed is the fixture itself", () => {
    expect(familySeed(tiny, 0)).toBe(tiny.seed);
    expect(familySeed(tiny, 1)).not.toBe(tiny.seed);
    expect(new Set(rows("router").map((r) => r.seed))).toEqual(new Set([0, 1]));
    const boards = ["gutter", ...listStrategies(STRATEGIES, "room").map((s) => s.name)];
    expect(rows("room").map((r) => r.strategy)).toEqual([...boards, ...boards]);
  });

  it("keeps the rows of today: the first seed gives the rows of benchOne", () => {
    const graph = makeFixture(tiny);
    const expected = routersOf(STRATEGIES).map((r) => strip(benchOne(r, tiny.name, graph, 2)));
    expect(bench.map(strip)).toEqual(expected);
  });

  it("gives each measure of the short list of MEAS0", () => {
    const keys = (step: string) => new Set(rows(step).flatMap((r) => Object.keys(r.values)));
    const router = keys("router");
    for (const k of ["R2.angle", "B1.inkSaved", "R5.median", "R4.turn", "Z10.mean", "R11.min", "B4.ambiguity", "Z7.position", "Z8.order", "G1.modularity", "G2.cut", "G8.treeCost"])
      expect(router.has(k), k).toBe(true);
    for (const k of ["C1.share", "C2.median", "C3.median"]) expect(keys("curve").has(k), k).toBe(true);
    expect(keys("group").has("G9.ari")).toBe(true);
    const rules = new Set(report.rules.map((r) => r.rule));
    for (const r of PROPOSED_RULES) expect(rules.has(r), r).toBe(true);
  });

  it("gives the same report for the same options", () => {
    const again = runSuite({ max: 20, seeds: 2, repeat: 2, fixtures: [tiny], roomFamilies: [{ name: "packed-small", cols: 4, rows: 3, long: 3 }] }).report;
    const values = (r: typeof report) => r.rows.map((x) => [x.step, x.fixture, x.seed, x.strategy, x.values]);
    expect(values(again)).toEqual(values(report));
    expect(again.fronts).toEqual(report.fronts);
  });

  it("gives a Pareto front for each step, without the strategies that break a hard rule", () => {
    expect(report.fronts.map((f) => f.step).sort()).toEqual(["curve", "group", "highway", "room", "router"]);
    const router = report.fronts.find((f) => f.step === "router")!;
    expect(router.front.length).toBeGreaterThan(0);
    for (const s of router.excluded) expect(router.front).not.toContain(s);
    expect(router.excluded).toContain("straight");
  });

  it("writes the tables", () => {
    for (const step of ["router", "curve", "room", "group"] as const) expect(formatSummaries(report.summaries, step).split("\n").length).toBeGreaterThan(2);
    expect(formatFronts(report.fronts).split("\n")).toHaveLength(2 + report.fronts.length);
    expect(formatRules(report.rules)).toContain("level-nesting");
    expect(formatMeasureTime(report.rows)).toContain("tiny-uniform");
  });
});

describe("runSuite in parts (BENCH-CI)", () => {
  const tiny = FIXTURES.find((f) => f.name === "tiny-uniform")!;
  const small = FIXTURES.find((f) => f.name === "small-clustered")!;
  const family = { name: "packed-small", cols: 4, rows: 3, long: 3 };
  const base = { max: 100, seeds: 2, repeat: 2, seedsMaxNodes: 10, fixtures: [tiny, small], roomFamilies: [family] };
  const one = runSuite(base).report;
  const seedsOf = (report: typeof one, fixture: string) => new Set(report.rows.filter((r) => r.fixture === fixture).map((r) => r.seed)).size;

  it("gives one seed to a family with more nodes than seedsMaxNodes", () => {
    expect(one.options.seedsMaxNodes).toBe(10);
    expect(seedsOf(one, "tiny-uniform")).toBe(2);
    expect(seedsOf(one, "small-clustered")).toBe(1);
    expect(seedsOf(one, "packed-small")).toBe(1);
  });

  it("runs only the steps and the routers of a part", () => {
    const part = runSuite({ ...base, fixtures: [small], steps: ["router"], routers: ["corners"] }).report;
    expect(new Set(part.rows.map((r) => `${r.step}/${r.strategy}`))).toEqual(new Set(["router/corners"]));
  });

  it("joins the reports of the parts into the report of one run", () => {
    const routers = routersOf(STRATEGIES).map((r) => r.name);
    const parts = [
      runSuite({ ...base, fixtures: [tiny] }).report,
      runSuite({ ...base, fixtures: [small], steps: ["router", "curve"], routers: routers.slice(0, 3) }).report,
      runSuite({ ...base, fixtures: [small], steps: ["router", "group"], routers: routers.slice(3) }).report,
      runSuite({ ...base, fixtures: [small], steps: ["highway"] }).report,
    ];
    const joined = joinReports([parts[2]!, parts[3]!, parts[0]!, parts[1]!], { roomFamilies: [family] });
    const key = (r: (typeof one.rows)[number]) => [r.step, r.fixture, r.seed, r.strategy, r.values];
    expect(joined.rows.map(key)).toEqual(one.rows.map(key));
    expect(joined.fronts).toEqual(one.fronts);
    expect(joined.rules).toEqual(one.rules);
    const medians = (s: (typeof one.summaries)[number]) => [s.step, s.fixture, s.strategy, s.seeds, s.violations, Object.keys(s.measures)];
    expect(joined.summaries.map(medians)).toEqual(one.summaries.map(medians));
    // The parts run the whole suite again, and each built-in strategy adds rows. Thus the test gets more time than the default.
  }, 30_000);
});
