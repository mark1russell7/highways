import { COMPARE_STEPS, createRegistry, getStrategy, listStrategies, STRATEGIES, type AnyStrategy, type Registry, type Step, type Strategy } from "@mark1russell7/highways";
import { describe, expect, it } from "vitest";
import { COMPARE_BOARDS, computePanels, controlOptions, CURVE_ROUTER, PACKED_BOARD, type ControlOption, type OptionValues, type Panel } from "./compare-data.ts";

/** The boards of the test, in the order of the page. A control is live when it changes the output on one of them. */
const BOARDS = COMPARE_BOARDS.map((b) => b.id);

/**
 * The controls that change nothing on each board, by `strategy.option`, with the reason. Keep this list short and true.
 * The test fails when a control on this list changes the output, or when a control off this list changes nothing.
 */
const NO_EFFECT: Readonly<Record<string, string>> = {
  "quadtree.collapse": "No cell of these boards shrinks two times without a split.",
  "sections.collapse": "No cell of these boards shrinks two times without a split.",
  "sections-tree.collapse": "No cell of these boards shrinks two times without a split.",
  "sections.tightMargin": "Only a level link whose plugs at the middle of a side find no way uses the second corner graph. No link of these boards does.",
  "sections-tree.tightMargin": "Only a level link whose plugs at the middle of a side find no way uses the second corner graph. No link of these boards does.",
  "trunks.laneOrder": "On these boards, the trunks give each shared way the same lane order with `bundle` and with `run`.",
  "shared.smooth": "The router `shared` finds its ways in the corner graph itself, and it does not read `smooth`. This is a gap of the core.",
  "shared-all.smooth": "The router `shared` finds its ways in the corner graph itself, and it does not read `smooth`. This is a gap of the core.",
  "levels.collapse": "No cell of these boards shrinks two times without a split.",
  "routes.lanes": "Each pair of boxes of these boards has one edge or none. So a link takes one lane with `link` and with `count`.",
  "lines.lanes": "Each pair of boxes of these boards has one edge or none. So a link takes one lane with `link` and with `count`.",
  "levels.board": "The room strategy `levels` gives the gaps of the board of the nodes. The option `board` changes only the boards of the far levels. This is a gap of the core.",
};

/** The options that act only with another option. The test sets the other option in the base state and in the changed state. */
const WITH: Readonly<Record<string, Readonly<Record<string, number | boolean | string>>>> = {
  "highway.jogPieces": { jog: "quintic" },
  // At the radius 12, one cubic piece of a clothoid is in each tolerance. A long clothoid of a large radius needs more pieces.
  "clothoid.tolerance": { radius: 48, spiral: 1 },
  // The router `sections-tree` has no hub limit (`stretch` is `Infinity`), so the pad of the hub limit acts only with a finite `stretch`.
  "sections-tree.stretchPad": { stretch: 2 },
  // The exponent of the flow cost acts only with the cost `flow` (EDA-029).
  "shared.alpha": { cost: "flow" },
  "shared-all.alpha": { cost: "flow" },
  // The reuse discount (HWY-005) acts only from the second pass. Its exponent acts only with a discount.
  "shared.reuse": { passes: 2 },
  "shared-all.reuse": { passes: 2 },
  "shared.reuseExponent": { passes: 2, reuse: 1 },
  "shared-all.reuseExponent": { passes: 2, reuse: 1 },
  // The lane width acts only with the channel capacity (HWY-016).
  "shared.laneWidth": { capacity: 1 },
  "shared-all.laneWidth": { capacity: 1 },
  // The passes of the sifting act only with the stretch order `sifting` (LANE-STRETCH).
  "shared.siftPasses": { stretchOrder: "sifting" },
  "shared-all.siftPasses": { stretchOrder: "sifting" },
  // The exponent of the trunks acts only with the Gilbert split (EDA-030), and the balancing factor only with the fan `tree` (NAT-017).
  "trunks.alpha": { splitAt: "gilbert" },
  "trunks.bf": { fan: "tree" },
};

/** This function gives the values off the default that the test tries: the other values of a list, or the ends of a range. */
function offValues(d: ControlOption, value: unknown): (number | boolean | string)[] {
  if (d.type === "boolean") return [value !== true];
  if (d.type === "enum") return d.values.filter((v) => v !== value);
  return [d.min, d.max].filter((v) => v !== value);
}

/** This function gives the output of a panel without the times: the drawing and each measure except `ms`. */
function outputOf(p: Panel): string {
  const measures = p.measures.filter((m) => m.key !== "ms").map((m) => `${m.key}=${String(m.value)}`);
  return JSON.stringify({ drawing: p.drawing, measures, violations: p.violations, skipped: p.skipped ?? "" });
}

/**
 * The steps whose controls the test runs: the steps of `compareStep` and the step `room`.
 * The step `highway` has more than 300 controls, and each run routes the board with `follow`. So this test does not run them. The test of `steps.test.ts` checks that each of them has a control.
 */
const LIVE_STEPS: readonly Step[] = [...COMPARE_STEPS, "room"];

/** This function gives a registry with one strategy, and the router of the step `curve` when the step needs it. */
function registryOf(step: Step, strategy: AnyStrategy): Registry {
  return createRegistry(step === "curve" ? [getStrategy(STRATEGIES, "router", CURVE_ROUTER), strategy] : [strategy]);
}

/** This function gives the panel of one strategy with the options of the state. */
function panelOf(step: Step, strategy: AnyStrategy, options: OptionValues, board: string = BOARDS[0]!): Panel {
  const data = computePanels({ step, board, options }, { registry: registryOf(step, strategy) });
  return data.panels.find((p) => p.strategy === strategy.name)!;
}

describe("the controls of the compare page (EX2-FIX)", () => {
  it("each control changes the drawing or the measures, except the controls of the short list", () => {
    let checked = 0;
    const dead: string[] = [];
    for (const step of LIVE_STEPS) {
      for (const strategy of listStrategies(STRATEGIES, step) as readonly (Strategy<Step, object> & AnyStrategy)[]) {
        for (const o of controlOptions(strategy)) {
          const id = `${strategy.name}.${o.key}`;
          const base = WITH[id] ?? {};
          const live = BOARDS.some((board) => {
            const before = outputOf(panelOf(step, strategy, { [strategy.name]: base }, board));
            return offValues(o.declaration, o.value).some((v) => outputOf(panelOf(step, strategy, { [strategy.name]: { ...base, [o.key]: v } }, board)) !== before);
          });
          checked++;
          if (!live) dead.push(id);
        }
      }
    }
    console.log(`EX2-FIX: ${checked} controls checked, ${dead.length} with no effect on ${BOARDS.length} boards: ${dead.join(", ") || "none"}`);
    expect(dead.sort()).toEqual(Object.keys(NO_EFFECT).sort());
  }, 120_000);

  it("gives the curve highway each option: jog quintic changes the lanes of the bundles", () => {
    const highway = getStrategy(STRATEGIES, "curve", "highway");
    const plain = panelOf("curve", highway, {});
    const arc = panelOf("curve", getStrategy(STRATEGIES, "curve", "arc"), {});
    // The lanes of a bundle bend as one, so the highway is not the curve `arc` of each lane.
    expect(plain.drawing.paths).not.toEqual(arc.drawing.paths);
    for (const options of [{ jog: "quintic" }, { jog: "cubic" }, { minRadius: 24 }]) expect(panelOf("curve", highway, { highway: options }).drawing.paths, JSON.stringify(options)).not.toEqual(plain.drawing.paths);
  }, 60_000);

  it("gives group keys to the boards, so the rule keys makes fewer groups than nodes and a far view that differs from the quadtree", () => {
    const registry = createRegistry([getStrategy(STRATEGIES, "group", "quadtree"), getStrategy(STRATEGIES, "group", "keys")]);
    // The packed board has no group keys and no collections, so the rule `keys` puts each box alone.
    for (const board of COMPARE_BOARDS.filter((b) => b.id !== PACKED_BOARD)) {
      const data = computePanels({ step: "group", board: board.id, options: {} }, { registry });
      const [quadtree, keys] = [data.panels[0]!, data.panels[1]!];
      const items = keys.measures.find((m) => m.key === "Z4.farItems")!.value;
      expect(items, board.id).toBeLessThan(board.nodes);
      expect(keys.drawing.groups.length, board.id).toBeGreaterThan(0);
      expect(outputOf(keys), board.id).not.toBe(outputOf(quadtree));
      expect(keys.drawing.groups, board.id).not.toEqual(quadtree.drawing.groups);
    }
  }, 60_000);
});
