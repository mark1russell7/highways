import type { WayOptions } from "../../../ways.ts";
import { lengthBetween, type HighwayInput, type HighwayPlan } from "../../model.ts";
import { edgeLengths, keepMembers, type Gate } from "../model.ts";

/** The options of the gate `breakeven` (HWY-047). */
export interface BreakEvenOptions {
  /**
   * The exponent of the cost law: a stretch with `n` edges costs `n^shareAlpha` times its length. Each edge pays the share `n^(shareAlpha - 1)`.
   * With 0, a shared stretch is one line, as the ink of B1 counts it. The default is 0.5, as the break-even floor of `corridors`.
   */
  readonly shareAlpha: number;
}

/** The default options of the gate `breakeven`. */
export const BREAK_EVEN_DEFAULTS: Readonly<BreakEvenOptions> = Object.freeze({ shareAlpha: 0.5 });

/**
 * This function applies the break-even law of HWY-047 to a plan. An edge stays on its highways only when sharing saves ink.
 *
 * The edge pays `n^(shareAlpha - 1)` of each shared stretch, with `n` the members of the highway. Thus it saves `(1 - n^(shareAlpha - 1)) L` on a stretch of the length `L`.
 * It adds the length of its route along the plan less the length of its route alone. An edge stays when the saving is as large as the added length.
 * For two parallel edges at the gap `d`, this rule gives the break-even overlap `d √((2 + t) / (2 - t))` with `t = 2^shareAlpha`.
 *
 * An edge that does not save ink leaves each of its highways. Then the other members of those highways save less, so the test repeats until no edge leaves.
 */
export function breakEvenPlan(input: HighwayInput, plan: HighwayPlan, options: Readonly<BreakEvenOptions>, way: WayOptions = {}): HighwayPlan {
  const lengths = edgeLengths(input.graph, plan, way);
  let now = plan;
  for (;;) {
    const saving = new Map<string, number>();
    for (const h of now.highways) {
      const share = 1 - Math.pow(h.members.length, options.shareAlpha - 1);
      for (const m of h.members) saving.set(m.edge, (saving.get(m.edge) ?? 0) + share * lengthBetween(h.spine, Math.min(m.on, m.off), Math.max(m.on, m.off)));
    }
    const out = new Set<string>();
    for (const [edge, saved] of saving) {
      const l = lengths.get(edge);
      if (l && saved < l.route - l.alone) out.add(edge);
    }
    if (out.size === 0) return now;
    now = keepMembers(now, (_, m) => !out.has(m.edge));
  }
}

/** The gate `breakeven` (HWY-047): an edge stays on a highway only when sharing saves ink. */
export const breakEvenGate: Gate<BreakEvenOptions> = {
  name: "breakeven",
  describe: "The gate `breakeven` (HWY-047) keeps an edge on a highway only when its share of the highway saves more ink than its detour adds.",
  defaults: BREAK_EVEN_DEFAULTS,
  schema: {
    shareAlpha: {
      type: "number",
      min: 0,
      max: 0.9,
      step: 0.1,
      marks: [0, 0.5],
      default: 0.5,
      describe: "The exponent of the cost law. An edge pays the share `n^(shareAlpha - 1)` of a stretch with `n` edges.",
    },
  },
  apply: breakEvenPlan,
};
