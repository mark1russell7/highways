/** What a rule selects: each variable, a variable with other legs, or a variable with its near boxes. `free-crossings` selects the crossings of the legs that a variable turns. */
export type RuleSelect = "free" | "free-pairs" | "free-boxes" | "free-crossings";

/**
 * What a solver moves. `legs` moves each free leg along its normal, so the leg keeps its direction.
 * `points` moves each free point in x and in y, so each leg at that point can turn.
 */
export type RuleVariable = "legs" | "points";

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
  /** What the solver moves. The default is `legs`. */
  readonly variable?: RuleVariable;
}

/** The selections that each term can read. */
const TERM_SELECTS: Readonly<Record<RuleTerm, readonly RuleSelect[]>> = {
  hold: ["free"],
  spring: ["free"],
  gap: ["free-pairs", "free-boxes"],
  angle: ["free-crossings"],
};

/** This function gives one text for each fault of a rule file. An empty list tells that the compiler takes the file. */
export function checkRules(set: RuleSet): string[] {
  const faults: string[] = [];
  if (set.variable !== undefined && set.variable !== "legs" && set.variable !== "points") faults.push(`There is no variable "${String(set.variable)}".`);
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
    { select: "free", term: "hold", weight: 0.05 },
    { select: "free-pairs", term: "gap", weight: 1 },
    { select: "free-boxes", term: "gap", weight: 4 },
  ],
};

/** The rule file of the elastic band (RULE-001): springs along the route and a push from the boxes. */
export const ELASTIC_RULES: RuleSet = {
  rules: [
    { select: "free", term: "hold", weight: 0.05 },
    { select: "free", term: "spring", weight: 1 },
    { select: "free-boxes", term: "gap", weight: 4 },
  ],
};

/** The rule file of the route-to-route repulsion with a cutoff (RULE-003). */
export const REPULSION_RULES: RuleSet = {
  rules: [
    { select: "free", term: "hold", weight: 0.05 },
    { select: "free-pairs", term: "gap", weight: 1 },
  ],
};

/** The rule file of the energy of RULE-019: length, clearance from routes and boxes, and the crossing angle. */
export const ENERGY_RULES: RuleSet = {
  rules: [
    { select: "free", term: "hold", weight: 0.05 },
    { select: "free", term: "spring", weight: 1 },
    { select: "free-pairs", term: "gap", weight: 1 },
    { select: "free-boxes", term: "gap", weight: 4 },
    { select: "free-crossings", term: "angle", weight: 1 },
  ],
};

/** The rule files that the option `preset` of the router `rules` names. */
export const RULE_PRESETS: Readonly<Record<"elastic" | "repulsion" | "adam" | "energy", RuleSet>> = { elastic: ELASTIC_RULES, repulsion: REPULSION_RULES, adam: ADAM_RULES, energy: ENERGY_RULES };
