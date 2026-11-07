import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { siteKpi, siteStamps } from "@mark1russell7/site-pages/vite";
import { defineConfig, type Plugin } from "vite";
import { atlasData } from "./src/atlas-data.ts";
import { ATLAS_FILES, atlasWeeks } from "./src/atlas-files.ts";
import type { BenchMeta } from "./src/bench-label.ts";
import { kpiFacts } from "./src/kpi-files.ts";
import { siteKpiInput } from "./src/kpi.ts";
import { buildInfo, dataLineHtml, readResults, RESULT_FILES, snapshotFiles, textSections } from "./src/results-files.ts";
import { verdictStamps, type VerdictHeader } from "./src/stamps.ts";
import { BUILT_FILE, readStrategies } from "./src/strategies-files.ts";

// The Pages workflow sets SITE_BASE to "/highways". A local build uses the root.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const base = env["SITE_BASE"] ? `${env["SITE_BASE"].replace(/\/$/, "")}/` : "/";
const page = (name: string): string => fileURLToPath(new URL(name, import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));

/** This function gives the input of `kpi.json`. A snapshot with no date stops the build, because the file then has no time of the data. */
function kpiInput(): NonNullable<ReturnType<typeof siteKpiInput>> {
  const meta = JSON.parse(readFileSync(join(root, RESULT_FILES.bench, "bench-meta.json"), "utf8")) as BenchMeta;
  const core = (JSON.parse(readFileSync(join(root, RESULT_FILES.core), "utf8")) as { version: string }).version;
  const input = siteKpiInput(meta, core, (file) => existsSync(page(file)), kpiFacts(root));
  if (input === undefined) throw new Error("bench-meta.json has no date, so kpi.json has no time of the data.");
  return input;
}

/** The files of the benchmark snapshot. The demo page reads them at run time. */
const BENCH_FILES = ["bench.json", "bench-meta.json"] as const;

/** The module id of the data of the results page. */
const RESULTS_ID = "virtual:results";

/** The module id of the data of the strategies page. */
const STRATEGIES_ID = "virtual:strategies";

/** The module id of the data of the atlas page. */
const ATLAS_ID = "virtual:atlas";

/**
 * This plugin gives the data of the results page, of the strategies page and of the atlas page from the committed files, at build time. The page reads no file and no network at run time.
 * It also puts the data line (the core release, the commit and the date of the build) in each page.
 * It copies the committed benchmark snapshot to `bench.json` and `bench-meta.json` of the site. The Pages build does not start the benchmark.
 */
function committedResults(): Plugin {
  const info = buildInfo(root, env);
  const line = dataLineHtml(info);
  return {
    name: "highways-committed-results",
    resolveId: (id) => (id === RESULTS_ID || id === STRATEGIES_ID || id === ATLAS_ID ? `\0${id}` : undefined),
    load(id) {
      if (id === `\0${ATLAS_ID}`) {
        // The weekly records give the leaders. The page reads the date of the viewer for the age of the latest record.
        this.addWatchFile(join(root, ATLAS_FILES.weeks));
        this.addWatchFile(join(root, ATLAS_FILES.text));
        const atlas = { view: atlasData(atlasWeeks(root), info.date), text: textSections(readFileSync(join(root, ATLAS_FILES.text), "utf8")), core: info.core };
        return `export default ${JSON.stringify(atlas)};`;
      }
      if (id === `\0${STRATEGIES_ID}`) {
        // The cards come from the registry of the core and the committed files, so a new strategy gets a card with no change to the page.
        for (const f of [...Object.values(RESULT_FILES), BUILT_FILE]) this.addWatchFile(join(root, f));
        return `export default ${JSON.stringify(readStrategies(root))};`;
      }
      if (id !== `\0${RESULTS_ID}`) return undefined;
      for (const f of Object.values(RESULT_FILES)) this.addWatchFile(join(root, f));
      return `export default ${JSON.stringify(readResults(root))};`;
    },
    // The demo page compares the date of the benchmark snapshot with the build date, and warns when the snapshot is old.
    transformIndexHtml: (html) => html.replace("<!--data-line-->", line).replace("<!--build-date-->", info.date),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = BENCH_FILES.find((f) => req.url === `${base}${f}`);
        if (name === undefined) return next();
        res.setHeader("content-type", "application/json");
        res.end(readFileSync(join(root, RESULT_FILES.bench, name)));
      });
    },
    generateBundle() {
      for (const fileName of BENCH_FILES) this.emitFile({ type: "asset", fileName, source: readFileSync(join(root, RESULT_FILES.bench, fileName)) });
    },
  };
}

// The site has six pages: the live demo, the examples, the compare page, the results, the strategy cards and the atlas.
export default defineConfig({
  base,
  // The freshness gate of the Pages workflow reads the stamps of the verdicts (VERDICT-STAMPS).
  plugins: [committedResults(), siteKpi(kpiInput, env), siteStamps(() => verdictStamps(snapshotFiles(root).map((f) => JSON.parse(f.text) as VerdictHeader), "mark1russell7/highways"))],
  worker: { format: "es" },
  build: {
    target: "es2022",
    rolldownOptions: {
      input: { main: page("./index.html"), examples: page("./examples.html"), compare: page("./compare.html"), results: page("./results.html"), strategies: page("./strategies.html"), atlas: page("./atlas.html") },
    },
  },
});
