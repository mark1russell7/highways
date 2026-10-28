// The times of the dense board (ROUTE-SCALE): `node scripts/scale.ts --router <name> [--fixture <file>] [--repeat <n>] [--out <file>] [--profile <file>]`.
// It routes the fixture with one router and writes the wall time of the route and of each step that the bench runs after the route.
// The workflow `Scale` (.github/workflows/scale.yml) starts it for each router. Times run in CI only, not on a local machine.
//
// The fixture is a `.json.gz` file with `{ manifestId, pack, env, graph }`. The default is `data/scale/route-scale-fixture.json.gz`.
// The router is `asRouter(routerStrategies[name])` with the default options, or `portfolioRouter()` for the name `portfolio`, as the joint runner of
// layout-contract calls them.
//
// The steps:
// - `route`: each run of the route. The first run is cold. With `--repeat 3`, the script also gives the warm median of the later runs.
// - `checkProperties`: the hard rules of the first result, with a limit of 1 000 000 breaks, as `benchRun` calls it.
// - `measureQuality`: the quality measures of the first result.
// - `exactStretches.build` and `exactStretches.use`: the network of the exact model, then its first use on the routes of the first result.
// - `portfolio.key` (only for `portfolio`): the time of the pick without the runs of the members. That is the key and the hashes of the pick.
//
// The route hash is `routeHash` of `scripts/xplat.ts`. `exact` is the first 16 hex digits of the SHA-256 of the exact lines of the result.
// Two equal hashes of the same router before and after a change show that the change keeps each byte of the output.
// With `--profile <file>`, the script keeps a CPU profile of the first route in `<file>` and a CPU profile of the steps in a file with the suffix `.steps.cpuprofile`.
// For each profile, it prints the 25 functions with the most self time.
import { createHash } from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { arch, cpus, platform } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { asRouter, checkProperties, exactStretches, measureQuality, routePortfolio, routerStrategies, sharedStretchStrategy, type Graph, type Result, type Strategy } from "../src/index.ts";
import { exactLines, routeHash } from "./xplat.ts";

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  hitCount?: number;
}

/** A CPU profile of the inspector. */
interface Profile {
  readonly nodes: ProfileNode[];
}

/** The time of one step, in milliseconds, with one decimal. */
const ms = (t: number): number => Math.round(t * 10) / 10;

/** This function gives the median of a list of numbers. The list is not empty. */
function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** The route of one router, with the time of the key of the pick for the portfolio router. */
interface Routed {
  readonly result: Result;
  readonly ms: number;
  readonly key?: number;
  readonly members?: readonly { readonly id: string; readonly status: string; readonly ms?: number }[];
}

/** This function gives the route function of a name, as the joint runner of layout-contract gives it. */
function routerOf(name: string): (graph: Graph) => Routed {
  if (name === "portfolio") {
    return (graph) => {
      const t0 = performance.now();
      const p = routePortfolio(graph);
      const t = performance.now() - t0;
      const members = p.trace.members.map((m) => ({ id: m.id, status: m.status, ...(m.ms === undefined ? {} : { ms: ms(m.ms) }) }));
      const run = p.trace.members.reduce((sum, m) => sum + (m.ms ?? 0), 0);
      return { result: p.result, ms: t, key: Math.max(0, t - run), members };
    };
  }
  // The opt-in router `shared-stretch` (LANE-STRETCH) is not in the registry. The name gives it here too.
  const s = name === "shared-stretch" ? (sharedStretchStrategy as unknown as Strategy<"router", object>) : (routerStrategies as unknown as Readonly<Record<string, Strategy<"router", object>>>)[name];
  if (s === undefined) throw new RangeError(`There is no router "${name}".`);
  const router = asRouter(s);
  return (graph) => {
    const t0 = performance.now();
    const result = router.route(graph);
    return { result, ms: performance.now() - t0 };
  };
}

/** This function gives the 25 functions with the most self time of a CPU profile, as Markdown rows. */
function topSelf(nodes: readonly ProfileNode[]): string {
  const self = new Map<string, number>();
  let total = 0;
  for (const n of nodes) {
    const hits = n.hitCount ?? 0;
    if (hits === 0) continue;
    const f = n.callFrame;
    const file = f.url.split("/").pop() ?? f.url;
    const key = `${f.functionName || "(anonymous)"} ${file}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + hits);
    total += hits;
  }
  const rows = [...self].sort((a, b) => b[1] - a[1]).slice(0, 25);
  return ["| self % | function |", "|---:|---|", ...rows.map(([key, hits]) => `| ${((100 * hits) / total).toFixed(1)} | ${key} |`)].join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const name = opt("--router") ?? "shared";
  const file = resolve(opt("--fixture") ?? fileURLToPath(new URL("./data/scale/route-scale-fixture.json.gz", import.meta.url)));
  const repeat = Math.max(1, Number(opt("--repeat") ?? "1"));
  const out = opt("--out");
  const profileFile = opt("--profile");
  const bytes = readFileSync(file);
  const doc = JSON.parse((file.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8")) as { manifestId?: string; graph: Graph };
  const graph = doc.graph;
  const route = routerOf(name);
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as { version: string };
  const env = { os: platform(), arch: arch(), cpu: (cpus()[0]?.model ?? "").trim(), node: process.version, highways: pkg.version };
  console.log(`scale: ${name} on ${doc.manifestId ?? file} (${graph.nodes.length} nodes, ${graph.edges.length} edges), ${env.os} ${env.arch} node ${env.node}, ${env.cpu}.`);

  // With `--profile`, a CPU profile covers the first route, and a second profile covers the steps.
  const profiler = async (): Promise<() => Promise<Profile>> => {
    const session = new Session();
    session.connect();
    await session.post("Profiler.enable");
    await session.post("Profiler.setSamplingInterval", { interval: 1000 });
    await session.post("Profiler.start");
    return async () => {
      const { profile } = (await session.post("Profiler.stop")) as { profile: Profile };
      session.disconnect();
      return profile;
    };
  };
  const keep = (path: string, what: string, profile: Profile): void => {
    writeFileSync(path, JSON.stringify(profile));
    console.log(`\nThe profile of ${what}:\n\n${topSelf(profile.nodes)}\n`);
  };
  const stopRoute = profileFile === undefined ? undefined : await profiler();
  const first = route(graph);
  if (stopRoute !== undefined) keep(profileFile!, `the first route of ${name} (${ms(first.ms)} ms, with the profiler)`, await stopRoute());
  console.log(`scale: ${name}: route 1 of ${repeat}: ${ms(first.ms)} ms.`);
  const runs = [first.ms];
  const hashes = new Set<string>();
  const result = first.result;
  const hash = routeHash(result);
  const exact = createHash("sha256").update(exactLines(result).join("\n")).digest("hex").slice(0, 16);
  for (let i = 1; i < repeat; i++) {
    const again = route(graph);
    runs.push(again.ms);
    hashes.add(routeHash(again.result));
    console.log(`scale: ${name}: route ${i + 1} of ${repeat}: ${ms(again.ms)} ms.`);
  }

  const steps: Record<string, number> = {};
  const time = <T>(step: string, fn: () => T): T => {
    const t0 = performance.now();
    const v = fn();
    steps[step] = ms(performance.now() - t0);
    console.log(`scale: ${name}: ${step}: ${steps[step]} ms.`);
    return v;
  };
  const stopSteps = profileFile === undefined ? undefined : await profiler();
  const violations = time("checkProperties", () => checkProperties(graph, result, 1_000_000)).length;
  time("measureQuality", () => measureQuality(graph, result));
  const stretches = time("exactStretches.build", () => exactStretches(graph));
  time("exactStretches.use", () => stretches(result.routes));
  if (stopSteps !== undefined) keep(profileFile!.replace(/\.cpuprofile$/, "") + ".steps.cpuprofile", `the steps of ${name}, with the profiler`, await stopSteps());
  if (first.key !== undefined) steps["portfolio.key"] = ms(first.key);

  const row = {
    router: name,
    manifestId: doc.manifestId ?? null,
    nodes: graph.nodes.length,
    edges: graph.edges.length,
    hash,
    exact,
    same: [...hashes].every((h) => h === hash),
    profiled: profileFile !== undefined,
    route: { cold: ms(first.ms), runs: runs.map(ms), ...(runs.length > 1 ? { warmMedian: ms(median(runs.slice(1))) } : {}) },
    steps,
    violations,
    ...(first.members === undefined ? {} : { members: first.members }),
    env,
  };
  if (out !== undefined) appendFileSync(out, JSON.stringify(row) + "\n");
  console.log(`scale: ${name}: hash ${hash}, exact ${exact}${row.same ? "" : " (the runs differ)"}.`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
