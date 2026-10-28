import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { buildInfo, dataLineHtml, readResults, RESULT_FILES } from "./src/results-files.ts";

// The Pages workflow sets SITE_BASE to "/highways". A local build uses the root.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const base = env["SITE_BASE"] ? `${env["SITE_BASE"].replace(/\/$/, "")}/` : "/";
const page = (name: string): string => fileURLToPath(new URL(name, import.meta.url));
const root = fileURLToPath(new URL("../../", import.meta.url));

/** The files of the benchmark snapshot. The demo page reads them at run time. */
const BENCH_FILES = ["bench.json", "bench-meta.json"] as const;

/** The module id of the data of the results page. */
const RESULTS_ID = "virtual:results";

/**
 * This plugin gives the data of the results page from the committed files, at build time. The page reads no file and no network at run time.
 * It also puts the data line (the core release, the commit and the date of the build) in each page.
 * It copies the committed benchmark snapshot to `bench.json` and `bench-meta.json` of the site. The Pages build does not start the benchmark.
 */
function committedResults(): Plugin {
  const info = buildInfo(root, env);
  const line = dataLineHtml(info);
  return {
    name: "highways-committed-results",
    resolveId: (id) => (id === RESULTS_ID ? `\0${RESULTS_ID}` : undefined),
    load(id) {
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

// The site has four pages: the live demo, the examples, the compare page and the results.
export default defineConfig({
  base,
  plugins: [committedResults()],
  worker: { format: "es" },
  build: {
    target: "es2022",
    rolldownOptions: {
      input: { main: page("./index.html"), examples: page("./examples.html"), compare: page("./compare.html"), results: page("./results.html") },
    },
  },
});
