// The trace of XPLAT-HASH: `node scripts/xplat.ts --inputs <dir>[,<dir>...] --out <dir> [--routers shared,sections,corners]`.
// It routes each graph of the inputs with each router, and writes the route hash, the exact routes and, with an env flag, a log of the Math calls.
// The workflow `Xplat` (.github/workflows/xplat.yml) starts it on each cell of a matrix of systems and node versions. `scripts/xplat-summary.ts` compares the cells.
//
// An input is a `.json` or `.json.gz` file of the joint bench of layout-contract: `{ manifestId, pack, env, routes, graph }`.
// `graph` is the routed graph. `routes[]` has the hashes of the joint bench for each router (the hashes of linux node 26 and of win32 node 24).
// When a `.json` and a `.json.gz` file have the same name, the script reads the `.json.gz` file only.
// The routers are the routers of `routes[]` of the input and `corners`, or the list of `--routers`.
//
// The route hash is `routeHash` of the joint runner of layout-contract: `outputHash({ routes sorted by edge, levels, bundles, runs }, { grid: RECORD_EPS })`.
// The router is `asRouter(routerStrategies[name]).route(graph)` with the default options, as the joint runner calls it.
// The script routes each graph two times without the log, so a cell also shows whether two runs give the same hash.
//
// The files in `--out`:
// - `meta.json`: the system, the node version, the V8 version and the version of the core.
// - `routes.jsonl`: one line for each input and router, with the hashes, the count of the Math calls and the hashes of the joint bench.
// - `routes/<input>.<router>.txt.gz`: the exact result. Each line is `<key>\t<canonical JSON>`, with the numbers of `JSON.stringify` (each number round trips).
//   The keys are `route <edge>` in the order of the edges, then `levels`, `bundles` and `runs`.
// - With `XPLAT_CALLS=1`: `calls/<input>.<router>.txt.gz`. The script routes the graph a third time with a wrapper on each Math function of `TRACED`.
//   Each line is the hash of 1000 calls in turn: the index of the function, the bits of each argument and the bits of the result.
//   The wrapper is only in this script. The source of the core does not change.
// - With `XPLAT_NEAR=<targets.json>`: `near/<input>.<router>.jsonl.gz`. The file of `xplat-summary.ts --targets` names the first chunk of 1000 calls
//   that differs between two cells, for each input and router. The script routes only those pairs, and writes each call of those chunks in full:
//   the function, the arguments and the result as hex bits and as numbers, and the frames of the stack in `src/`.
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { arch, platform } from "node:os";
import { basename, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { canonicalJson, outputHash, RECORD_EPS } from "@mark1russell7/layout-contract";
import { asRouter, routerStrategies, type Graph, type Result, type Strategy } from "../src/index.ts";

/** The Math functions that the log wraps. The index of a name in this list is its id in the hash of a chunk. */
export const TRACED = ["hypot", "atan2", "sin", "cos", "tan", "acos", "asin", "atan", "exp", "log", "pow"] as const;
/** The name of a traced Math function. */
export type TracedName = (typeof TRACED)[number];
/** The count of calls in one chunk of the log. */
export const CHUNK = 1000;

type MathFn = (...values: number[]) => number;

/** The hashes of the joint bench for one router of an input. */
interface JointRoute {
  readonly router: string;
  readonly here?: { readonly route?: string; readonly cornersRoute?: string };
  readonly win32Node24?: { readonly route?: string };
}

/** One input file of the joint bench. */
interface XplatInput {
  readonly name: string;
  readonly manifestId: string;
  readonly routes: readonly JointRoute[];
  readonly graph: Graph;
}

/** One call of a traced Math function, in full. */
export interface NearCall {
  readonly i: number;
  readonly fn: TracedName;
  readonly args: readonly string[];
  readonly result: string;
  readonly values: readonly number[];
  readonly value: number;
  readonly at: readonly string[];
}

const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);

/** This function gives the 64 bits of a number as 16 hex digits, the high word first. */
export function bits(x: number): string {
  F64[0] = x;
  return U32[1]!.toString(16).padStart(8, "0") + U32[0]!.toString(16).padStart(8, "0");
}

/** This function gives the frames of a stack in the `src/` folder of a package, as `src/<file>:<line>:<column> <function>`. */
export function srcFrames(stack: string | undefined, max = 6): string[] {
  const out: string[] = [];
  for (const raw of (stack ?? "").split("\n").slice(1)) {
    const line = raw.replace(/\\/g, "/");
    const m = /at (?:(.+?) \()?.*?\/packages\/[^/]+\/(src\/[^:)]+):(\d+):(\d+)/.exec(line);
    if (!m) continue;
    out.push(`${m[2]}:${m[3]}:${m[4]}${m[1] ? ` ${m[1]}` : ""}`);
    if (out.length >= max) break;
  }
  return out;
}

/** The log of the Math calls of one route. */
class CallLog {
  count = 0;
  readonly perFn: Record<string, number> = {};
  readonly chunks: string[] = [];
  readonly near: NearCall[] = [];
  readonly dump: ReadonlySet<number>;
  h1 = 0x811c9dc5;
  h2 = 0x9747b28c;

  constructor(dump: ReadonlySet<number>) {
    this.dump = dump;
  }

  word(w: number): void {
    this.h1 = Math.imul(this.h1 ^ w, 0x01000193);
    this.h2 = Math.imul(this.h2 ^ w, 0x5bd1e995) ^ (this.h2 >>> 13);
  }

  number(x: number): void {
    F64[0] = x;
    const lo = U32[0]!;
    const hi = U32[1]!;
    this.word(lo);
    this.word(hi);
  }

  record(index: number, name: TracedName, raw: readonly unknown[], result: number): void {
    const values = raw.map((v) => (typeof v === "number" ? v : Number(v)));
    this.word(index + 1);
    this.word(values.length);
    for (const v of values) this.number(v);
    this.number(result);
    this.perFn[name] = (this.perFn[name] ?? 0) + 1;
    if (this.dump.has(Math.floor(this.count / CHUNK))) {
      this.near.push({ i: this.count, fn: name, args: values.map(bits), result: bits(result), values, value: result, at: srcFrames(new Error().stack) });
    }
    this.count++;
    if (this.count % CHUNK === 0) this.close();
  }

  close(): void {
    this.chunks.push((this.h1 >>> 0).toString(16).padStart(8, "0") + (this.h2 >>> 0).toString(16).padStart(8, "0"));
    this.h1 = 0x811c9dc5;
    this.h2 = 0x9747b28c;
  }

  finish(): void {
    if (this.count % CHUNK !== 0) this.close();
  }
}

/** This function puts a wrapper on each traced Math function, and gives the function that takes the wrappers off. */
function wrapMath(log: CallLog): () => void {
  const target = Math as unknown as Record<string, MathFn>;
  const original = new Map<TracedName, MathFn>();
  TRACED.forEach((name, index) => {
    const fn = target[name]!;
    original.set(name, fn);
    target[name] = (...values: number[]): number => {
      const r = fn(...values);
      log.record(index, name, values, r);
      return r;
    };
  });
  return () => {
    for (const [name, fn] of original) target[name] = fn;
  };
}

/** This function gives the route hash of a result, with the rule of `routeHash` of the joint runner of layout-contract. */
export function routeHash(result: Result): string {
  const routes = [...result.routes].sort((a, b) => (a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : 0));
  return outputHash({ routes, levels: result.levels, bundles: result.bundles, runs: result.runs }, { grid: RECORD_EPS });
}

/** This function gives the lines of the exact result: `<key>\t<canonical JSON>`. */
export function exactLines(result: Result): string[] {
  const routes = [...result.routes].sort((a, b) => (a.edge < b.edge ? -1 : a.edge > b.edge ? 1 : 0));
  const lines = routes.map((r) => `route ${r.edge}\t${canonicalJson(r)}`);
  lines.push(`levels\t${canonicalJson(result.levels ?? null)}`, `bundles\t${canonicalJson(result.bundles ?? null)}`, `runs\t${canonicalJson(result.runs ?? null)}`);
  return lines;
}

/** This function gives the first 16 hex digits of the SHA-256 of a text. */
function sha16(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** This function gives the input files under the folders: each `.json` or `.json.gz` file, one for each name. */
function inputFiles(dirs: readonly string[]): Map<string, string> {
  const byName = new Map<string, string>();
  const visit = (path: string): void => {
    if (statSync(path).isDirectory()) {
      for (const e of readdirSync(path).sort()) visit(join(path, e));
      return;
    }
    const file = basename(path);
    const m = /^(.*)\.json(\.gz)?$/.exec(file);
    if (!m) return;
    const name = m[1]!;
    const had = byName.get(name);
    if (had === undefined || (m[2] !== undefined && !had.endsWith(".gz"))) byName.set(name, path);
  };
  for (const d of dirs) visit(resolve(d));
  return new Map([...byName].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** This function reads one input file, or gives nothing when the file has no graph. */
function readInput(name: string, path: string): XplatInput | undefined {
  const bytes = readFileSync(path);
  const text = (path.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8");
  const doc = JSON.parse(text) as Partial<XplatInput>;
  if (doc.graph === undefined || !Array.isArray(doc.graph.nodes)) return undefined;
  return { name, manifestId: doc.manifestId ?? name, routes: doc.routes ?? [], graph: doc.graph };
}

/** This function gives the router of a name, as the joint runner of layout-contract gives it. */
function routerOf(name: string): (graph: Graph) => Result {
  const s = (routerStrategies as unknown as Readonly<Record<string, Strategy<"router", object>>>)[name];
  if (s === undefined) throw new RangeError(`There is no router "${name}".`);
  const router = asRouter(s);
  return (graph) => router.route(graph);
}

/** This function gives the hashes of the joint bench for one router of an input. */
function jointHashes(input: XplatInput, router: string): { readonly linuxNode26?: string; readonly win32Node24?: string } {
  if (router === "corners") {
    const c = input.routes.find((r) => r.here?.cornersRoute !== undefined)?.here?.cornersRoute;
    return c === undefined ? {} : { linuxNode26: c };
  }
  const r = input.routes.find((x) => x.router === router);
  return {
    ...(r?.here?.route === undefined ? {} : { linuxNode26: r.here.route }),
    ...(r?.win32Node24?.route === undefined ? {} : { win32Node24: r.win32Node24.route }),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const inputs = (opt("--inputs") ?? fileURLToPath(new URL("./data/xplat", import.meta.url))).split(",");
  const out = resolve(opt("--out") ?? "xplat-out");
  const routersArg = opt("--routers")?.split(",");
  const calls = process.env["XPLAT_CALLS"] === "1";
  const nearFile = process.env["XPLAT_NEAR"];
  const targets: Record<string, readonly number[]> | undefined = nearFile ? (JSON.parse(readFileSync(nearFile, "utf8")) as Record<string, readonly number[]>) : undefined;
  if (targets !== undefined) Error.stackTraceLimit = 40;

  mkdirSync(join(out, "routes"), { recursive: true });
  mkdirSync(join(out, "calls"), { recursive: true });
  if (targets !== undefined) mkdirSync(join(out, "near"), { recursive: true });
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as { version: string };
  const meta = { os: platform(), arch: arch(), node: process.version, v8: process.versions.v8, highways: pkg.version, near: targets !== undefined };
  writeFileSync(join(out, "meta.json"), JSON.stringify(meta, null, 2) + "\n");
  const lines = join(out, targets === undefined ? "routes.jsonl" : "near.jsonl");
  writeFileSync(lines, "");
  console.log(`xplat: ${meta.os} ${meta.arch} node ${meta.node} V8 ${meta.v8}, highways ${meta.highways}.`);

  const files = inputFiles(inputs);
  for (const [name, path] of files) {
    const input = readInput(name, path);
    if (input === undefined) continue;
    const routers = routersArg ?? [...new Set([...input.routes.map((r) => r.router), "corners"])];
    for (const router of routers) {
      const key = `${name}/${router}`;
      const route = routerOf(router);
      const stem = `${name}.${router}`;
      if (targets !== undefined) {
        const chunks = targets[key];
        if (chunks === undefined || chunks.length === 0) continue;
        const log = new CallLog(new Set(chunks));
        const unwrap = wrapMath(log);
        let traced: string;
        try {
          traced = routeHash(route(input.graph));
        } finally {
          unwrap();
        }
        log.finish();
        writeFileSync(join(out, "near", `${stem}.jsonl.gz`), gzipSync(log.near.map((c) => JSON.stringify(c)).join("\n") + "\n"));
        appendFileSync(lines, JSON.stringify({ record: name, router, traced, calls: log.count, chunks: chunks, near: log.near.length }) + "\n");
        console.log(`xplat: ${key}: ${log.near.length} calls of the chunks ${chunks.join(", ")}.`);
        continue;
      }
      const t0 = performance.now();
      const first = route(input.graph);
      const ms = performance.now() - t0;
      const hash = routeHash(first);
      const exact = exactLines(first);
      const exactHash = sha16(exact.join("\n"));
      writeFileSync(join(out, "routes", `${stem}.txt.gz`), gzipSync(exact.join("\n") + "\n"));
      const again = routeHash(route(input.graph));
      let traced: string | null = null;
      let log: CallLog | undefined;
      if (calls) {
        log = new CallLog(new Set());
        const unwrap = wrapMath(log);
        try {
          traced = routeHash(route(input.graph));
        } finally {
          unwrap();
        }
        log.finish();
        writeFileSync(join(out, "calls", `${stem}.txt.gz`), gzipSync(log.chunks.join("\n") + "\n"));
      }
      const row = {
        record: name,
        manifestId: input.manifestId,
        router,
        edges: first.routes.length,
        hash,
        again,
        traced,
        exact: exactHash,
        ms: Math.round(ms),
        calls: log?.count ?? null,
        perFn: log?.perFn ?? null,
        joint: jointHashes(input, router),
      };
      appendFileSync(lines, JSON.stringify(row) + "\n");
      const same = hash === again && (traced === null || traced === hash) ? "" : " (the runs differ)";
      console.log(`xplat: ${key}: ${hash}${same}, exact ${exactHash}, ${row.ms} ms, ${row.calls ?? 0} calls.`);
    }
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
