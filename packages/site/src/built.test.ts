import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { listStrategies, STEPS, STRATEGIES } from "@mark1russell7/highways";
import { describe, expect, it } from "vitest";
import { ideaRecords } from "./results-files.ts";
import { IDEA_ID, type BuiltMap } from "./strategies-data.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const built = JSON.parse(readFileSync(join(root, "docs/research/ideas/built.json"), "utf8")) as BuiltMap;
const records = new Map(ideaRecords(root).map((r) => [r.id, r]));
const registered = STEPS.flatMap((step) => listStrategies(STRATEGIES, step).map((s) => ({ key: `${step}/${s.name}`, strategy: s })));
const cited = (text: string): string[] => text.match(IDEA_ID) ?? [];

// The map `docs/research/ideas/built.json` links each registered strategy to the idea records that it builds.
// A new strategy needs a line in `strategies`, in `options` or in `noRecord`.
describe("the map of built ideas", () => {
  it("has each registered strategy, and only those", () => {
    const keys = registered.map((r) => r.key);
    const linked = new Set([...Object.keys(built.strategies), ...Object.keys(built.options)]);
    const missing = keys.filter((k) => !linked.has(k) && !built.noRecord.includes(k));
    expect(missing, "Add each new strategy to docs/research/ideas/built.json").toEqual([]);
    for (const k of [...linked, ...built.noRecord]) expect(keys, `${k} is not a registered strategy`).toContain(k);
    for (const k of built.noRecord) expect(linked.has(k), `${k} is in noRecord and has a link`).toBe(false);
    console.log(`Strategies with no idea record (${built.noRecord.length} of ${keys.length}): ${built.noRecord.join(", ")}`);
  });

  it("names only idea records that exist", () => {
    const ids = [...Object.values(built.strategies).flat(), ...Object.values(built.options).flatMap((o) => Object.values(o).flat())];
    expect(ids.filter((id) => !records.has(id))).toEqual([]);
  });

  it("has each idea that a description cites", () => {
    for (const { key, strategy } of registered) {
      for (const id of cited(strategy.describe)) expect(built.strategies[key] ?? [], `${key} cites ${id}`).toContain(id);
      for (const [option, d] of Object.entries(strategy.schema ?? {})) {
        for (const id of cited((d as { describe: string }).describe)) expect(built.options[key]?.[option] ?? [], `${key} option ${option} cites ${id}`).toContain(id);
      }
    }
    for (const [key, options] of Object.entries(built.options)) {
      const s = registered.find((r) => r.key === key)!.strategy;
      for (const option of Object.keys(options)) expect(Object.keys(s.schema ?? {}), `${key} has no option ${option}`).toContain(option);
    }
  });
});
