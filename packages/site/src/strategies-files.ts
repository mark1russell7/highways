/// <reference types="node" />
// The build reads the registry and the committed files of the strategies page with these functions. Only `vite.config.ts` and the tests use them.
// They read the repository on disk. They never use the network.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listStrategies, STEPS, STRATEGIES, type Registry } from "@mark1russell7/highways";
import { parseSnapshot } from "./results-data.ts";
import { ideaRecords, RESULT_FILES, snapshotFiles } from "./results-files.ts";
import { strategiesData, type BuiltMap, type CardRecord, type StrategiesData, type StrategyInput } from "./strategies-data.ts";

/** The map of the built ideas, relative to the root of the repository. */
export const BUILT_FILE = "docs/research/ideas/built.json";

/** This function reads the map of the built ideas. */
export function readBuilt(root: string): BuiltMap {
  return JSON.parse(readFileSync(join(root, BUILT_FILE), "utf8")) as BuiltMap;
}

/** This function gives the strategies of each step of a registry as plain data, in the order of the steps. */
export function strategyInputs(registry: Registry = STRATEGIES): StrategyInput[] {
  return STEPS.flatMap((step) =>
    listStrategies(registry, step).map((s) => ({
      step,
      name: s.name,
      describe: s.describe,
      defaults: s.defaults as Readonly<Record<string, unknown>>,
      schema: (s.schema ?? {}) as unknown as Readonly<Record<string, Readonly<Record<string, unknown>>>>,
    })),
  );
}

/** This function makes the data of the strategies page from the registry and the files of the repository at `root`. */
export function readStrategies(root: string, registry: Registry = STRATEGIES): StrategiesData {
  const bench = join(root, RESULT_FILES.bench);
  return strategiesData({
    steps: STEPS,
    strategies: strategyInputs(registry),
    records: ideaRecords(root) as unknown as CardRecord[],
    built: readBuilt(root),
    snapshots: snapshotFiles(root).map((f) => parseSnapshot(f.text, f.name)),
    bench: JSON.parse(readFileSync(join(bench, "bench.json"), "utf8")) as StrategiesDataBench,
    benchMeta: JSON.parse(readFileSync(join(bench, "bench-meta.json"), "utf8")) as { run?: number; date?: string },
  });
}

/** The rows of `bench.json` that the cards read. */
type StrategiesDataBench = { router: string; fixture: string; ms?: number }[];
