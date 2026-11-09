// The curve settings of the screen of D23-PHYSICAL: the elastic band (NAT-026).
// Start: `pnpm screen --step curve --module scripts/screens/d23-physical-curve.ts`. The baseline is the built-in curve strategies, with `elastic`.
import { ELASTIC_DEFAULTS, elasticCurve, type ElasticStrategyOptions } from "../../src/curves/elastic/index.ts";
import type { CurveSegment } from "../../src/curves/model.ts";
import { defineStrategy, type CurveInput, type Strategy } from "../../src/strategies/model.ts";

/** This function makes a curve strategy of `elastic` with the name `name` and the options `options`. */
function variant(name: string, options: Partial<ElasticStrategyOptions>): Strategy<"curve", object> {
  const o = { ...ELASTIC_DEFAULTS, ...options };
  const run = (input: CurveInput): CurveSegment[] =>
    elasticCurve(input.points, {
      ...(input.startNormal ? { startNormal: input.startNormal } : {}),
      ...(input.endNormal ? { endNormal: input.endNormal } : {}),
      ...(input.space ? { space: input.space } : {}),
      ...o,
    });
  // A variant keeps the rules of `elastic`, so the screen examines C1 and C10 on it too.
  return defineStrategy({ step: "curve", name, describe: `The settings ${JSON.stringify(o)}.`, defaults: {}, schema: {}, curveRules: { g1: true, normals: true }, run });
}

// NAT-026: springs only, a long relaxation, and dense samples.
export const elasticSprings = variant("elastic-springs", { clearance: 0 });
export const elasticR100 = variant("elastic-r100", { rounds: 100 });
export const elasticStep4 = variant("elastic-step4", { step: 4 });
