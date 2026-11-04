import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import { measureQuality } from "../../bench/quality.ts";
import { clustered, hub } from "../../highways/fixtures.test-util.ts";
import { checkOptions } from "../../strategies/options.ts";
import { ADAM_DEFAULTS, adamStrategy } from "../adam/index.ts";
import { sharedRouter } from "../shared.ts";
import { byCollection } from "../trunks.ts";
import { ADAM_RULES, checkRules, compileRules, ELASTIC_RULES, REPULSION_RULES, RULES_DEFAULTS, RULES_SCHEMA, rulesRouter, rulesStrategy, type RuleSet } from "./index.ts";

describe("the rule language (RULE-036)", () => {
  it("takes each rule file of the package", () => {
    for (const set of [ADAM_RULES, ELASTIC_RULES, REPULSION_RULES]) {
      expect(checkRules(set)).toEqual([]);
      expect(compileRules(set)).toHaveLength(set.rules.length);
    }
  });

  it("names each fault of a rule file, and the compiler refuses that file", () => {
    const bad = {
      rules: [
        { select: "legs", term: "gap", weight: 1 },
        { select: "legs", term: "hold", weight: 0 },
        { select: "legs", term: "spring", weight: 1, distance: 4 },
        { select: "legs", term: "flow", weight: 1 },
      ],
    } as unknown as RuleSet;
    expect(checkRules(bad)).toHaveLength(4);
    expect(checkRules({ rules: [] })).toHaveLength(1);
    expect(() => compileRules(bad)).toThrow(/does not read the selection/);
  });

  it("keeps a rule file as JSON data, with the same routes after a round trip", () => {
    const copy = JSON.parse(JSON.stringify(ELASTIC_RULES)) as RuleSet;
    const a = rulesRouter({ name: "x", rule: byCollection, rules: ELASTIC_RULES }).route(hub);
    expect(rulesRouter({ name: "x", rule: byCollection, rules: copy }).route(hub)).toEqual(a);
  }, 60_000);
});

describe("the router rules (RULE-036)", () => {
  it("gives the routes of `adam` from the rule file of `adam`", () => {
    for (const graph of [hub, clustered]) {
      const compiled = rulesStrategy.run(graph, { ...RULES_DEFAULTS, preset: "adam" });
      expect(compiled.routes).toEqual(adamStrategy.run(graph, { ...ADAM_DEFAULTS }).routes);
    }
  }, 60_000);

  it("gives the same routes for the same seed, with no break of a hard rule and no added crossing", () => {
    for (const preset of ["elastic", "repulsion"] as const) {
      for (const graph of [hub, clustered]) {
        const first = rulesStrategy.run(graph, { ...RULES_DEFAULTS, preset });
        expect(rulesStrategy.run(graph, { ...RULES_DEFAULTS, preset })).toEqual(first);
        expect(checkProperties(graph, first, 1_000_000), preset).toEqual([]);
        const base = sharedRouter({ name: "x", rule: byCollection }).route(graph);
        expect(measureQuality(graph, first).crossings, preset).toBeLessThanOrEqual(measureQuality(graph, base).crossings);
      }
    }
  }, 120_000);

  it("moves other legs with another rule file", () => {
    const elastic = rulesStrategy.run(clustered, { ...RULES_DEFAULTS, preset: "elastic" });
    const repulsion = rulesStrategy.run(clustered, { ...RULES_DEFAULTS, preset: "repulsion" });
    expect(JSON.stringify(elastic.routes)).not.toBe(JSON.stringify(repulsion.routes));
  }, 60_000);

  it("gives the boxes of a larger distance to a term `gap`", () => {
    const wide: RuleSet = { rules: [{ select: "leg-boxes", term: "gap", weight: 4, distance: 64 }] };
    const near: RuleSet = { rules: [{ select: "leg-boxes", term: "gap", weight: 4, distance: 2 }] };
    const route = (rules: RuleSet): string => JSON.stringify(rulesRouter({ name: "x", rule: byCollection, rules }).route(clustered).routes);
    expect(route(wide)).not.toBe(route(near));
  }, 60_000);

  it("declares each option in its schema", () => {
    expect(checkOptions(rulesStrategy, RULES_DEFAULTS)).toEqual([]);
    expect(Object.keys(RULES_SCHEMA).sort()).toEqual(Object.keys(RULES_DEFAULTS).sort());
  });
});
