/** What a rule selects: each free leg, each free leg with other legs, each free leg with its near boxes, or the crossings of the two legs next to a free leg. */
export type RuleSelect = "legs" | "leg-pairs" | "leg-boxes" | "leg-crossings";

/**
 * What a rule measures at each thing that it selects.
 * `hold` keeps a leg near its first place. `spring` shortens the two legs next to a leg. `gap` pushes a leg away from a thing nearer than a distance.
 * `angle` turns a crossing toward a right angle.
 */
export type RuleTerm = "hold" | "spring" | "gap" | "angle";

/** One rule of the drawing: a selection and a term, with a weight (RULE-036). A rule is data, so a file can hold it. */
export interface Rule {
  readonly select: RuleSelect;
  readonly term: RuleTerm;
  /** The weight of the term in the energy, a number larger than 0. */
  readonly weight: number;
  /** The distance of a term `gap`. The default is the option `clearance` of the solver. */
  readonly distance?: number;
}

/** A rule file: the rules that the solver adds into one energy, in this order. */
export interface RuleSet {
  readonly rules: readonly Rule[];
}

/** The selections that each term can read. */
const TERM_SELECTS: Readonly<Record<RuleTerm, readonly RuleSelect[]>> = {
  hold: ["legs"],
  spring: ["legs"],
  gap: ["leg-pairs", "leg-boxes"],
  angle: ["leg-crossings"],
};

/** This function gives one text for each fault of a rule file. An empty list tells that the compiler takes the file. */
export function checkRules(set: RuleSet): string[] {
  const faults: string[] = [];
  if (set.rules.length === 0) faults.push("A rule file has at least one rule.");
  set.rules.forEach((rule, i) => {
    const selects = TERM_SELECTS[rule.term];
    if (selects === undefined) faults.push(`Rule ${i}: there is no term "${String(rule.term)}".`);
    else if (!selects.includes(rule.select)) faults.push(`Rule ${i}: the term "${rule.term}" does not read the selection "${String(rule.select)}".`);
    if (!Number.isFinite(rule.weight) || rule.weight <= 0) faults.push(`Rule ${i}: the weight is a number larger than 0.`);
    if (rule.distance !== undefined && (rule.term !== "gap" || !Number.isFinite(rule.distance) || rule.distance <= 0)) faults.push(`Rule ${i}: only a term "gap" has a distance, a number larger than 0.`);
  });
  return faults;
}

/** The rule file of the router `adam`: the energy of RULE-020 as data. */
export const ADAM_RULES: RuleSet = {
  rules: [
    { select: "legs", term: "hold", weight: 0.05 },
    { select: "leg-pairs", term: "gap", weight: 1 },
    { select: "leg-boxes", term: "gap", weight: 4 },
  ],
};

/** The rule file of the elastic band (RULE-001): springs along the route and a push from the boxes. */
export const ELASTIC_RULES: RuleSet = {
  rules: [
    { select: "legs", term: "hold", weight: 0.05 },
    { select: "legs", term: "spring", weight: 1 },
    { select: "leg-boxes", term: "gap", weight: 4 },
  ],
};

/** The rule file of the route-to-route repulsion with a cutoff (RULE-003). */
export const REPULSION_RULES: RuleSet = {
  rules: [
    { select: "legs", term: "hold", weight: 0.05 },
    { select: "leg-pairs", term: "gap", weight: 1 },
  ],
};

/** The rule file of the energy of RULE-019: length, clearance from routes and boxes, and the crossing angle. */
export const ENERGY_RULES: RuleSet = {
  rules: [
    { select: "legs", term: "hold", weight: 0.05 },
    { select: "legs", term: "spring", weight: 1 },
    { select: "leg-pairs", term: "gap", weight: 1 },
    { select: "leg-boxes", term: "gap", weight: 4 },
    { select: "leg-crossings", term: "angle", weight: 1 },
  ],
};

/** The rule files that the option `preset` of the router `rules` names. */
export const RULE_PRESETS: Readonly<Record<"elastic" | "repulsion" | "adam" | "energy", RuleSet>> = { elastic: ELASTIC_RULES, repulsion: REPULSION_RULES, adam: ADAM_RULES, energy: ENERGY_RULES };
