import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { siteKpi, siteStamps } from "@mark1russell7/site-pages/vite";
import { defineConfig, type Plugin } from "vite";
import { atlasData, type AtlasPage } from "./src/atlas-data.ts";
import { ATLAS_FILES } from "./src/atlas-files.ts";
import { atlasHistory, liveGate, type AtlasHistory } from "./src/atlas-history.ts";
import { ATLAS_WEEKS_FILE } from "./src/atlas-weeks.ts";
import type { BenchMeta } from "./src/bench-label.ts";
import { SWEEP_DIR } from "./src/explorer-data.ts";
import { explorerPage } from "./src/explorer-files.ts";
import { kpiFacts } from "./src/kpi-files.ts";
import { siteKpiInput } from "./src/kpi.ts";
import { buildInfo, dataLineHtml, readResults, RESULT_FILES, snapshotFiles, textSections } from "./src/results-files.ts";
import { siteDataStamps, type VerdictHeader } from "./src/stamps.ts";
import { BUILT_FILE, readStrategies } from "./src/strategies-files.ts";

// The Pages workflow sets SITE_BASE to "/highways". A local build uses the root.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const base = env["SITE_BASE"] ? `${env["SITE_BASE"].replace(/\/$/, "")}/` : "/";
const page = (name: string): string => fileURLToPath(new URL(name, import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));

/** This function reads `bench-meta.json` of the benchmark snapshot. The Pages build first puts the newest record of the branch `bench-data` there. */
function benchMeta(): BenchMeta {
  return JSON.parse(readFileSync(join(root, RESULT_FILES.bench, "bench-meta.json"), "utf8")) as BenchMeta;
}

/** This function gives the input of `kpi.json`. A snapshot with no date stops the build, because the file then has no time of the data. */
function kpiInput(): NonNullable<ReturnType<typeof siteKpiInput>> {
  const meta = benchMeta();
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

/** The module id of the data of the explorer page. */
const EXPLORER_ID = "virtual:explorer";

/**
 * This plugin gives the data of four pages from the committed files, at build time: the results, the strategies, the atlas and the explorer. The page reads no file and no network at run time.
 * It also puts the data line (the core release, the commit and the date of the build) in each page.
 * It copies the committed benchmark snapshot to `bench.json` and `bench-meta.json` of the site. The Pages build does not start the benchmark.
 *
 * It writes the source of each week of the atlas to `atlas-weeks.json`, and it compares these weeks with the weeks of the live site.
 * The variable `ATLAS_LIVE_CHECK=off` stops the comparison, for a local build with no network. CI does not set it.
 */
function committedResults(): Plugin {
  const info = buildInfo(root, env);
  const line = dataLineHtml(info);
  // The build derives each week after the newest committed record from the git history. It reads the history one time.
  let history: AtlasHistory | undefined;
  const weeks = (): AtlasHistory => (history ??= atlasHistory(root, info.date));
  return {
    name: "highways-committed-results",
    resolveId: (id) => (id === RESULTS_ID || id === STRATEGIES_ID || id === ATLAS_ID || id === EXPLORER_ID ? `\0${id}` : undefined),
    load(id) {
      if (id === `\0${ATLAS_ID}`) {
        // The committed records and the derived records give the leaders. The page reads the date of the viewer for the age of the latest record.
        this.addWatchFile(join(root, ATLAS_FILES.weeks));
        this.addWatchFile(join(root, ATLAS_FILES.text));
        const h = weeks();
        const atlas: AtlasPage = { view: atlasData(h.weeks, info.date), text: textSections(readFileSync(join(root, ATLAS_FILES.text), "utf8")), core: info.core, sources: h.file.weeks, skipped: h.file.skipped };
        return `export default ${JSON.stringify(atlas)};`;
      }
      if (id === `\0${EXPLORER_ID}`) {
        // The newest sweep record of the folder, with its size and its date. The explorer reads the record only through parseResponseRecord.
        this.addWatchFile(join(root, SWEEP_DIR));
        return `export default ${JSON.stringify(explorerPage(root))};`;
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
        if (req.url === `${base}${ATLAS_WEEKS_FILE}`) {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(weeks().file, null, 2));
          return;
        }
        const name = BENCH_FILES.find((f) => req.url === `${base}${f}`);
        if (name === undefined) return next();
        res.setHeader("content-type", "application/json");
        res.end(readFileSync(join(root, RESULT_FILES.bench, name)));
      });
    },
    async generateBundle() {
      for (const fileName of BENCH_FILES) this.emitFile({ type: "asset", fileName, source: readFileSync(join(root, RESULT_FILES.bench, fileName)) });
      const file = weeks().file;
      this.emitFile({ type: "asset", fileName: ATLAS_WEEKS_FILE, source: `${JSON.stringify(file, null, 2)}\n` });
      for (const gap of file.skipped) this.warn(`The atlas has no record of the week ${gap.date}. ${gap.reason}`);
      // A past week of the live site does not change. A week that changes stops the deploy.
      if (env["ATLAS_LIVE_CHECK"] === "off") {
        console.log("ATLAS_LIVE_CHECK=off: the build does not compare the weeks of the atlas with the live site.");
        return;
      }
      const verdict = await liveGate(file);
      if (!verdict.ok) this.error(verdict.line);
      console.log(verdict.line);
    },
  };
}

// The site has seven pages: the live demo, the examples, the compare page, the results, the strategy cards, the atlas and the explorer.
export default defineConfig({
  base,
  // The freshness gate of the Pages workflow reads the stamps of the verdicts (VERDICT-STAMPS) and of the benchmark snapshot (HOME-STAMPS).
  plugins: [committedResults(), siteKpi(kpiInput, env), siteStamps(() => siteDataStamps(snapshotFiles(root).map((f) => JSON.parse(f.text) as VerdictHeader), benchMeta(), "mark1russell7/highways"))],
  worker: { format: "es" },
  build: {
    target: "es2022",
    rolldownOptions: {
      input: { main: page("./index.html"), examples: page("./examples.html"), compare: page("./compare.html"), results: page("./results.html"), strategies: page("./strategies.html"), atlas: page("./atlas.html"), explorer: page("./explorer.html") },
    },
  },
});
