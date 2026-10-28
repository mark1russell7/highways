import { fileURLToPath } from "node:url";
import { listStrategies, STEPS, STRATEGIES } from "@mark1russell7/highways";
import { describe, expect, it } from "vitest";
import { EXTRA_LINKS, OPTION_LINKS, strategyIdeas } from "../../core/scripts/strategy-ideas.ts";
import { ideaRecords } from "./results-files.ts";
import { IDEA_ID } from "./strategies-data.ts";
import { builtMap, strategyInputs } from "./strategies-files.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const records = new Map(ideaRecords(root).map((r) => [r.id, r]));
const registered = new Map<string, ReturnType<typeof listStrategies>[number]>(STEPS.flatMap((step) => listStrategies(STRATEGIES, step).map((s) => [`${step}:${s.name}`, s] as const)));
const map = strategyIdeas(strategyInputs());
const cited = (text: string): string[] => text.match(IDEA_ID) ?? [];

// The map of `packages/core/scripts/strategy-ideas.ts` links each registered strategy and its options to the idea records that they build.
// The cards of the strategies page read it.
describe("the map from the strategies to their ideas", () => {
  it("has extra links only for registered strategies and their options", () => {
    for (const key of [...Object.keys(EXTRA_LINKS), ...Object.keys(OPTION_LINKS)]) expect(registered.has(key), `${key} is not a registered strategy`).toBe(true);
    for (const [key, options] of Object.entries(OPTION_LINKS)) {
      for (const option of Object.keys(options)) expect(Object.keys(registered.get(key)?.schema ?? {}), `${key} has no option ${option}`).toContain(option);
    }
  });

  it("names only idea records that exist", () => {
    const ids = map.flatMap((m) => [...m.ideas, ...Object.values(m.options ?? {}).flat()]);
    expect(ids.filter((id) => !records.has(id))).toEqual([]);
  });

  it("has each idea that a description of a strategy or of an option cites", () => {
    for (const m of map) {
      const s = registered.get(`${m.step}:${m.strategy}`)!;
      for (const id of cited(s.describe)) expect(m.ideas, `${m.step}:${m.strategy} cites ${id}`).toContain(id);
      for (const [option, d] of Object.entries(s.schema ?? {})) {
        for (const id of cited((d as { describe: string }).describe)) expect(m.options?.[option] ?? [], `${m.step}:${m.strategy} option ${option} cites ${id}`).toContain(id);
      }
    }
  });

  it("gives the cards the ideas of corridors, of its gates and of the options of shared", () => {
    const built = builtMap(strategyInputs());
    expect(built.strategies["highway/corridors"]).toContain("HWY-031");
    expect(built.strategies["highway/corridors+stretch"]).toEqual(expect.arrayContaining(["HWY-031", "HWY-048"]));
    expect(built.options["router/shared"]?.["cost"]).toContain("EDA-029");
    expect(built.options["router/shared"]?.["merge"]).toContain("NAT-035");
    expect(built.options["router/shared"]?.["order"]).toEqual(expect.arrayContaining(["NAT-024", "WILD-022"]));
    const none = map.filter((m) => m.ideas.length === 0 && Object.keys(m.options ?? {}).length === 0).map((m) => `${m.step}:${m.strategy}`);
    console.log(`Strategies with no idea record (${none.length} of ${map.length}): ${none.join(", ")}`);
  });

  // The texts `describe` of the strategies of wave 3G (BUILD-W3G) cite their ideas, so `EXTRA_LINKS` has no entry for them.
  it("gives the cards the ideas of the highway strategies of wave 3G", () => {
    const built = builtMap(strategyInputs());
    expect(built.strategies["highway/steiner"]).toEqual(expect.arrayContaining(["HWY-036", "EDA-015"]));
    expect(built.strategies["highway/gaps"]).toContain("HWY-057");
    expect(built.strategies["highway/streets"]).toContain("HWY-058");
    expect(built.strategies["highway/search"]).toContain("HWY-059");
    expect(built.strategies["highway/interchanges"]).toContain("HWY-060");
  });
});
