// The command line of the screen: `pnpm screen [--step router] [--strategy <name,...>] [--module <file,...>] [--export <name,...>]
// [--options <file.json>] [--families <a,b>] [--no-baseline] [--predictions <file.jsonl>] [--inputs <dir>] [--commit <sha>]
// [--wrap <stable,repair>] [--shuffles <n>] [--out screen.jsonl] [--summary screen.md]`.
// `--wrap` adds the router `<name>+<w>` for each router and each wrapper. `--shuffles` measures the order fragility (W3) over this number of random orders.
// `--strategy` names strategies of the registry. `--module` loads a prototype file and screens each export that is a strategy of the step,
// or only the exports of `--export`. The registry does not change. Without `--strategy` and `--module`, the screen runs the built-in strategies.
// The workflow `Screen` starts it in CI. Locally, start it only on one or two small families, for example `--families tiny-uniform`.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { formatScreen, parseLines, recordLines, screen, SCREEN_STEPS, SCREEN_WRAPS, type LayoutInput, type LayoutPrediction, type ScreenStep, type ScreenWrap } from "../src/bench/screen/index.ts";
import type { Strategy } from "../src/strategies/model.ts";

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const list = (name: string): string[] | undefined =>
  opt(name)
    ?.split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);

const step = (opt("--step") ?? "router") as ScreenStep;
if (!SCREEN_STEPS.includes(step)) throw new Error(`The screen has no step "${step}". The steps are ${SCREEN_STEPS.join(", ")}.`);

const isStrategy = (x: unknown): x is Strategy<ScreenStep> =>
  typeof x === "object" && x !== null && (x as { step?: unknown }).step === step && typeof (x as { name?: unknown }).name === "string" && typeof (x as { run?: unknown }).run === "function";

const strategies: (Strategy<ScreenStep> | string)[] = [...(list("--strategy") ?? [])];
const only = list("--export");
for (const file of list("--module") ?? []) {
  const mod = (await import(pathToFileURL(resolve(file)).href)) as Record<string, unknown>;
  const found = Object.entries(mod).filter(([name, value]) => isStrategy(value) && (only?.includes(name) ?? true));
  if (found.length === 0) throw new Error(`The file "${file}" exports no strategy of the step "${step}".`);
  for (const [, value] of found) if (!strategies.includes(value as Strategy<ScreenStep>)) strategies.push(value as Strategy<ScreenStep>);
}

const optionsFile = opt("--options");
const options = optionsFile ? (JSON.parse(readFileSync(optionsFile, "utf8")) as Record<string, object>) : undefined;
const predictionsFile = opt("--predictions");
const predictions = predictionsFile ? parseLines<LayoutPrediction>(readFileSync(predictionsFile, "utf8")) : undefined;

// `--inputs` reads the input files of a folder, at any depth, in the order of their paths. Without it, the screen makes the files of `screen-v1`.
const inputsDir = opt("--inputs");
const files = (dir: string): string[] =>
  readdirSync(dir)
    .sort()
    .flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : n.endsWith(".json") && n !== "index.json" ? [join(dir, n)] : []));
const inputs = inputsDir ? files(inputsDir).map((f) => JSON.parse(readFileSync(f, "utf8")) as LayoutInput) : undefined;

const commit = (() => {
  const given = opt("--commit") ?? process.env["GITHUB_SHA"];
  if (given) return given.slice(0, 7);
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
})();

const wrap = list("--wrap") ?? [];
for (const w of wrap) if (!SCREEN_WRAPS.includes(w as ScreenWrap)) throw new Error(`The screen has no wrapper "${w}". The wrappers are ${SCREEN_WRAPS.join(", ")}.`);
const shuffles = Number(opt("--shuffles") ?? "0");
if (!Number.isInteger(shuffles) || shuffles < 0) throw new Error(`The value of --shuffles is not a whole number of 0 or more.`);

const start = performance.now();
const report = screen(step, strategies, {
  ...(inputs ? { inputs } : {}),
  ...(list("--families") ? { families: list("--families")! } : {}),
  baseline: !args.includes("--no-baseline"),
  ...(options ? { options } : {}),
  ...(predictions ? { predictions } : {}),
  ...(commit ? { commit } : {}),
  ...(wrap.length > 0 ? { wrap: wrap as ScreenWrap[] } : {}),
  ...(shuffles > 0 ? { shuffles } : {}),
  log: (line) => process.stderr.write(line + "\n"),
});
const seconds = (performance.now() - start) / 1000;
const out = opt("--out") ?? "screen.jsonl";
writeFileSync(out, recordLines(report.records));
const text = formatScreen(report.summary) + `\n${report.records.length} records in ${seconds.toFixed(1)} s.\n`;
writeFileSync(opt("--summary") ?? "screen.md", text);
console.log(text);
