import { BUILT_IN_STRATEGIES, createRegistry, defineStrategy, listStrategies, STRATEGIES, straightRouter, type Graph } from "@mark1russell7/highways";
import { describe, expect, it } from "vitest";
import { bestValues, COLUMNS, COMPARE_BOARDS, computePanels, formatHash, parseHash, pickFirst, readPick, type ComparePanels } from "./compare-data.ts";

/** The board of 100 nodes: the fixture `small-clustered`, with made-up data. */
const BOARD = "small-clustered";

/** This function checks the best marks of the panels against the values, without `bestValues`. */
function expectBestMarks(data: ComparePanels): void {
  for (const column of COLUMNS[data.step]) {
    const fair = data.panels.filter((p) => p.violations === 0 && p.skipped === undefined);
    const values = fair.map((p) => p.measures.find((m) => m.key === column.key)!.value).filter((v) => !Number.isNaN(v));
    for (const p of data.panels) {
      const m = p.measures.find((x) => x.key === column.key)!;
      if (!column.better || values.length === 0 || !fair.includes(p)) {
        if (!column.better || !fair.includes(p)) expect(m.best, `${p.strategy} ${column.key}`).toBe(false);
        continue;
      }
      const best = column.better === "min" ? Math.min(...values) : Math.max(...values);
      expect(m.best, `${p.strategy} ${column.key}`).toBe(Number.isFinite(best) && Math.abs(m.value - best) <= 1e-9 * Math.max(1, Math.abs(best)));
    }
    if (column.better && values.some((v) => Number.isFinite(v))) expect(data.panels.some((p) => p.measures.find((m) => m.key === column.key)!.best), column.key).toBe(true);
  }
}

describe("the panels of the compare page (EX2)", () => {
  it("offers only boards of 100 nodes or fewer, and the board of 100 nodes is one of them", () => {
    expect(COMPARE_BOARDS.length).toBeGreaterThanOrEqual(4);
    for (const b of COMPARE_BOARDS) expect(b.nodes).toBeLessThanOrEqual(100);
    expect(COMPARE_BOARDS.find((b) => b.id === BOARD)?.nodes).toBe(100);
  });

  it("computes each router panel of the board of 100 nodes, with the measures, the best marks and the front", () => {
    const t0 = performance.now();
    const data = computePanels({ step: "router", board: BOARD, options: {} });
    const ms = performance.now() - t0;
    // The time of all router panels on this machine. The report of EX2 records it.
    console.log(`EX2: all ${data.panels.length} router panels of ${BOARD} took ${ms.toFixed(0)} ms`);
    expect(data.nodes).toBe(100);
    expect(data.panels.map((p) => p.strategy)).toEqual(listStrategies(STRATEGIES, "router").map((s) => s.name));
    for (const p of data.panels) {
      expect(p.skipped).toBeUndefined();
      for (const key of ["R9.through", "R1.crossings", "R6.worstDetour", "ink", "ms"]) {
        const m = p.measures.find((x) => x.key === key);
        expect(m, `${p.strategy} ${key}`).toBeDefined();
        expect(Number.isNaN(m!.value), `${p.strategy} ${key}`).toBe(false);
      }
      expect(p.drawing.boxes).toHaveLength(100);
      expect(p.drawing.paths.length).toBeGreaterThan(0);
    }
    expectBestMarks(data);
    const front = data.panels.filter((p) => p.front);
    expect(front.length).toBeGreaterThan(0);
    for (const p of front) expect(p.violations).toBe(0);
    // The control `straight` goes through boxes, so it breaks a hard rule and is not on the front.
    expect(data.panels.find((p) => p.strategy === "straight")!.violations).toBeGreaterThan(0);
    expect(data.panels.find((p) => p.strategy === "straight")!.front).toBe(false);
  });

  it("marks the best values with bestValues", () => {
    const data = computePanels({ step: "router", board: "courses", options: {} });
    const rows = data.panels.map((p) => ({ step: "router" as const, strategy: p.strategy, violations: p.violations, ms: 0, values: Object.fromEntries(p.measures.map((m) => [m.key, m.value])) }));
    const best = bestValues("router", rows);
    for (const p of data.panels) for (const m of p.measures) if (m.best) expect(m.value).toBeCloseTo(best.get(m.key)!, 9);
  });

  it("computes the curve and the group panels, with the measures of their step", () => {
    for (const step of ["curve", "group"] as const) {
      const data = computePanels({ step, board: "courses", options: {} });
      expect(data.panels.map((p) => p.strategy)).toEqual(listStrategies(STRATEGIES, step).map((s) => s.name));
      for (const p of data.panels) for (const c of COLUMNS[step]) expect(p.measures.some((m) => m.key === c.key)).toBe(true);
      expectBestMarks(data);
    }
    const curves = computePanels({ step: "curve", board: "courses", options: {} });
    expect(curves.panels.find((p) => p.strategy === "straight")!.measures.find((m) => m.key === "C5.peak")!.value).toBe(Infinity);
    expect(curves.panels.find((p) => p.strategy === "clothoid")!.measures.find((m) => m.key === "C2.median")!.best).toBe(true);
    const groups = computePanels({ step: "group", board: "courses", options: {} });
    expect(groups.panels.some((p) => p.drawing.groups.length > 0)).toBe(true);
  });

  it("gives a panel to a new strategy of the registry with no change to the page", () => {
    const mine = defineStrategy({ step: "router", name: "mine", describe: "A made-up router for the test.", defaults: {}, schema: {}, run: (g: Graph) => straightRouter.route(g) });
    const registry = createRegistry([...BUILT_IN_STRATEGIES, mine]);
    const data = computePanels({ step: "router", board: "courses", options: {} }, { registry });
    expect(data.panels.map((p) => p.strategy)).toContain("mine");
    expect(data.panels).toHaveLength(listStrategies(STRATEGIES, "router").length + 1);
  });

  it("runs a strategy with the options of the state", () => {
    const radius = computePanels({ step: "curve", board: "courses", options: { arc: { radius: 30 } } });
    const plain = computePanels({ step: "curve", board: "courses", options: {} });
    const arc = (d: ComparePanels) => d.panels.find((p) => p.strategy === "arc")!;
    expect(arc(radius).options).toEqual({ radius: 30 });
    expect(arc(radius).drawing.paths).not.toEqual(arc(plain).drawing.paths);
  });

  it("keeps the step, the board and the options in the URL hash", () => {
    const state = { step: "curve" as const, board: "delivery", options: { arc: { radius: 20 }, highway: { jog: "quintic" } } };
    const hash = formatHash(state);
    expect(hash).toBe("#step=curve&board=delivery&arc.radius=20&highway.jog=quintic");
    expect(parseHash(hash)).toEqual(state);
    // A value out of the range moves into the range. A default, an unknown key and a bad value drop out.
    expect(parseHash("#step=curve&board=delivery&arc.radius=99999&arc.nope=1&rounded.radius=12&highway.jog=zigzag").options).toEqual({ arc: { radius: 48 } });
    expect(parseHash("#step=nope&board=nope")).toEqual({ step: "router", board: "delivery", options: {} });
  });

  it("opens with the strategies of the key pick, and ignores a name that the step does not have (COMPARE-PICK)", () => {
    // One name, as a card of the strategies links it.
    expect(parseHash("#step=highway&pick=corridors").pick).toEqual(["corridors"]);
    // Two names or more, in the order of the link, each one time. A `+` of a name stays, raw or as `%2B`.
    const state = parseHash("#step=highway&board=delivery&pick=keys,corridors+stretch,keys,corridors%2Bbreakeven");
    expect(state.pick).toEqual(["keys", "corridors+stretch", "corridors+breakeven"]);
    expect(formatHash(state)).toBe("#step=highway&board=delivery&pick=keys,corridors+stretch,corridors+breakeven");
    expect(parseHash(formatHash(state))).toEqual(state);
    // A name of another step, a made-up name and an empty name: the page ignores them, and the note tells the first two.
    expect(readPick("#step=router&pick=shared,arc,nope,,", "router")).toEqual({ pick: ["shared"], unknown: ["arc", "nope"] });
    expect(parseHash("#step=router&pick=nope").pick).toBeUndefined();
    expect(parseHash("#step=router").pick).toBeUndefined();
    // The picked panels come first, in the order of the pick. The other panels keep the order of the registry.
    const rows = ["a", "b", "c", "d"].map((strategy) => ({ strategy }));
    expect(pickFirst(rows, ["c", "a"]).map((r) => r.strategy)).toEqual(["c", "a", "b", "d"]);
    expect(pickFirst(rows).map((r) => r.strategy)).toEqual(["a", "b", "c", "d"]);
  });
});
