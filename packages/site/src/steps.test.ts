import {
  BUILT_IN_STRATEGIES,
  COMPARE_ALL_STEPS,
  createRegistry,
  defineStrategy,
  FIXTURES,
  getStrategy,
  listOptions,
  listStrategies,
  makeFixture,
  STEPS,
  STRATEGIES,
  straightRouter,
  type AnyStrategy,
  type Graph,
  type Registry,
  type Step,
  type Strategy,
} from "@mark1russell7/highways";
import { describe, expect, it } from "vitest";
import { COLUMNS, computePanels, PAGE_STEPS, STEP_NAMES } from "./compare-data.ts";
import { demoPickers, demoRoute } from "./demo-data.ts";
import { controlOptions, isControl, textOptions } from "./options.ts";

/** The smallest board of the compare page: the fixture `tiny-uniform`, with made-up data. */
const TINY = "tiny-uniform";

/** This function gives the names of the strategies of one step of a registry, in its order. */
const names = (registry: Registry, step: Step): string[] => listStrategies(registry, step).map((s) => s.name);

/** This function gives a made-up strategy of each step, for the test that a new strategy gets its place with no change to the pages. */
function madeUp(step: Step): AnyStrategy {
  const base = { name: "made-up", describe: "A made-up strategy for the test.", defaults: {}, schema: {} };
  if (step === "group") return defineStrategy({ ...base, step, run: (g: Graph) => getStrategy(STRATEGIES, "group", "quadtree").run(g) });
  if (step === "router") return defineStrategy({ ...base, step, run: (g: Graph) => straightRouter.route(g) });
  if (step === "highway") return defineStrategy({ ...base, step, run: (input) => getStrategy(STRATEGIES, "highway", "corridors").run(input) });
  if (step === "curve") return defineStrategy({ ...base, step, run: (input) => getStrategy(STRATEGIES, "curve", "straight").run(input) });
  if (step === "plugs") return defineStrategy({ ...base, step, run: (input) => getStrategy(STRATEGIES, "plugs", "facing").run(input) });
  if (step === "levels") return defineStrategy({ ...base, step, run: (input) => getStrategy(STRATEGIES, "levels", "depths").run(input) });
  if (step === "whole") return defineStrategy({ ...base, step, run: (g: Graph) => getStrategy(STRATEGIES, "whole", "pipeline").run(g) });
  return defineStrategy({ ...base, step: "room", run: (input) => getStrategy(STRATEGIES, "room", "lines").run(input) });
}

describe("each step and each strategy on the pages (COMPARE-ALL)", () => {
  it("compares each step of STEPS, in the order of the pipeline", () => {
    expect(COMPARE_ALL_STEPS).toEqual(STEPS);
    expect(PAGE_STEPS).toEqual(STEPS);
    for (const step of STEPS) {
      expect(STEP_NAMES[step], step).toBeTruthy();
      expect(COLUMNS[step]?.length, step).toBeGreaterThan(0);
    }
  });

  it("gives the compare page a panel for each strategy of each step of the registry", () => {
    const counts: string[] = [];
    for (const step of STEPS) {
      const data = computePanels({ step, board: TINY, options: {} });
      expect(data.panels.map((p) => p.strategy), step).toEqual(names(STRATEGIES, step));
      for (const p of data.panels) for (const c of COLUMNS[step]) expect(p.measures.some((m) => m.key === c.key), `${step} ${p.strategy} ${c.key}`).toBe(true);
      counts.push(`${step} ${data.panels.length}`);
    }
    // The counts of the registry at the time of the run. The report of COMPARE-ALL records them.
    console.log(`COMPARE-ALL: ${counts.join(", ")}`);
  }, 120_000);

  it("gives the demo a picker for each step, with each strategy of the registry", () => {
    const pickers = demoPickers();
    expect(pickers.map((p) => p.step)).toEqual(STEPS);
    for (const p of pickers) expect(p.names, p.step).toEqual(names(STRATEGIES, p.step));
  });

  it("gives a new strategy of each step its panel and its pick with no change to the pages", () => {
    for (const step of STEPS) {
      const registry = createRegistry([...BUILT_IN_STRATEGIES, madeUp(step)]);
      const data = computePanels({ step, board: TINY, options: {} }, { registry: createRegistry([...(step === "curve" ? [getStrategy(STRATEGIES, "router", "shared")] : []), madeUp(step)]) });
      expect(data.panels.map((p) => p.strategy), step).toEqual(["made-up"]);
      expect(demoPickers(registry).find((p) => p.step === step)!.names, step).toContain("made-up");
    }
  }, 60_000);

  it("gives each option with a range a control, and each other option its default as text, for each strategy of each step", () => {
    let controls = 0;
    let texts = 0;
    for (const step of STEPS) {
      for (const strategy of listStrategies(STRATEGIES, step) as readonly Strategy<Step, object>[]) {
        const all = listOptions(strategy);
        const c = controlOptions(strategy).map((o) => o.key);
        const t = textOptions(strategy).map((o) => o.key);
        expect(c, `${step} ${strategy.name}`).toEqual(all.filter((o) => isControl(o.declaration)).map((o) => o.key));
        expect([...c, ...t].sort(), `${step} ${strategy.name}`).toEqual(all.map((o) => o.key).sort());
        for (const o of textOptions(strategy)) expect(o.text.length, `${strategy.name}.${o.key}`).toBeGreaterThan(0);
        controls += c.length;
        texts += t.length;
      }
    }
    console.log(`COMPARE-ALL: ${controls} controls, ${texts} options shown as text`);
  });

  it("routes the demo with each pick of each step, on the smallest fixture", () => {
    const graph = makeFixture(FIXTURES.find((f) => f.name === TINY)!);
    const pickers = demoPickers();
    const of = (step: Step): readonly string[] => pickers.find((p) => p.step === step)!.names;
    for (const router of of("router")) expect(demoRoute(graph, { router }).result.routes.length, router).toBeGreaterThan(0);
    for (const highway of of("highway")) expect(demoRoute(graph, { router: "corners", highway }).result.routes.length, highway).toBeGreaterThan(0);
    for (const group of of("group")) expect(demoRoute(graph, { router: "sections", group }).result.levels?.length, group).toBeGreaterThan(0);
    // The default rules of the steps `plugs` and `levels` and the default whole strategy give the routes of the router alone.
    for (const plugs of of("plugs")) expect(demoRoute(graph, { router: "corners", plugs }).result.routes.length, plugs).toBeGreaterThan(0);
    for (const levels of of("levels")) expect(demoRoute(graph, { router: "sections", levels }).result.levels?.length, levels).toBeGreaterThan(0);
    for (const whole of of("whole")) expect(demoRoute(graph, { router: "corners", whole }).result.routes.length, whole).toBeGreaterThan(0);
    expect(demoRoute(graph, { router: "corners", plugs: "facing" }).result).toEqual(demoRoute(graph, { router: "corners" }).result);
    expect(demoRoute(graph, { router: "sections", levels: "depths" }).result).toEqual(demoRoute(graph, { router: "sections" }).result);
    for (const room of of("room")) {
      const open = demoRoute(graph, { router: "corners", room });
      expect(open.graph.nodes, room).toHaveLength(graph.nodes.length);
      expect(open.result.routes.length, room).toBeGreaterThan(0);
    }
  }, 120_000);
});
