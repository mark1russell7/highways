// The summary of XPLAT-HASH: `node scripts/xplat-summary.ts --cells <dir> [--near <dir>] [--targets <file>] [--out <md>] [--json <file>]`.
// Each folder under `--cells` with a `meta.json` file is the output of `scripts/xplat.ts` on one cell of the matrix (a system and a node version).
// The script compares each cell with the reference cell: linux with node 26, the cell of the joint bench of layout-contract.
// - The table of the route hashes, with a letter for each group of cells that agree.
// - For each route that differs, the first key and the first value that differ, and whether the difference changes a decision or only moves a point.
// - With the call logs, the first chunk of 1000 Math calls that differs. With `--targets <file>`, the script writes only those chunks, for `XPLAT_NEAR`.
// - With `--near <dir>` (the outputs of `XPLAT_NEAR`), the first call that differs: the function, the arguments, the two results and the frames in `src/`.
// The script needs only node. It imports no package.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

/** The facts of a cell. */
interface Meta {
  readonly os: string;
  readonly arch: string;
  readonly node: string;
  readonly v8: string;
  readonly highways: string;
}

/** One line of `routes.jsonl`. */
interface Row {
  readonly record: string;
  readonly router: string;
  readonly edges: number;
  readonly hash: string;
  readonly again: string;
  readonly traced: string | null;
  readonly exact: string;
  readonly ms: number;
  readonly calls: number | null;
  readonly perFn: Readonly<Record<string, number>> | null;
  readonly joint: { readonly linuxNode26?: string; readonly win32Node24?: string };
}

/** One call of the near log. */
interface NearCall {
  readonly i: number;
  readonly fn: string;
  readonly args: readonly string[];
  readonly result: string;
  readonly values: readonly (number | null)[];
  readonly value: number | null;
  readonly at: readonly string[];
}

/** One cell of the matrix. */
interface Cell {
  readonly id: string;
  readonly dir: string;
  readonly meta: Meta;
  readonly rows: ReadonlyMap<string, Row>;
}

const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);

/** This function gives the place of a number on the line of all doubles, so that two neighbors are 1 apart. */
function ordered(x: number): bigint {
  F64[0] = x;
  const u = (BigInt(U32[1]!) << 32n) | BigInt(U32[0]!);
  const sign = 1n << 63n;
  return u >= sign ? -(u - sign) : u;
}

/** This function gives the count of doubles between two numbers (the distance in ulps). */
export function ulps(a: number, b: number): bigint {
  const d = ordered(a) - ordered(b);
  return d < 0n ? -d : d;
}

/** This function gives the number of 16 hex digits of bits. */
function fromBits(hex: string): number {
  U32[1] = Number.parseInt(hex.slice(0, 8), 16);
  U32[0] = Number.parseInt(hex.slice(8, 16), 16);
  return F64[0]!;
}

/** The first difference of two values, and the size of all their differences. */
interface Walk {
  first: { readonly path: string; readonly a: unknown; readonly b: unknown } | undefined;
  shape: boolean;
  numbers: number;
  maxAbs: number;
  maxUlps: bigint;
}

/** This function compares two JSON values. A different length, a different key or a different text is a change of shape. */
export function walk(a: unknown, b: unknown, path: string, out: Walk): void {
  if (typeof a === "number" && typeof b === "number") {
    if (a === b) return;
    out.first ??= { path, a, b };
    out.numbers++;
    out.maxAbs = Math.max(out.maxAbs, Math.abs(a - b));
    const u = ulps(a, b);
    if (u > out.maxUlps) out.maxUlps = u;
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      out.first ??= { path: `${path}.length`, a: a.length, b: b.length };
      out.shape = true;
    }
    for (let i = 0; i < Math.min(a.length, b.length); i++) walk(a[i], b[i], `${path}[${i}]`, out);
    return;
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(ao), ...Object.keys(bo)])].sort();
    for (const k of keys) {
      if (!(k in ao) || !(k in bo)) {
        out.first ??= { path: `${path}.${k}`, a: ao[k], b: bo[k] };
        out.shape = true;
        continue;
      }
      walk(ao[k], bo[k], `${path}.${k}`, out);
    }
    return;
  }
  if (a !== b) {
    out.first ??= { path, a, b };
    out.shape = true;
  }
}

/** This function reads a text file that can be gzipped. It gives nothing when the file is not there. */
function readText(path: string): string | undefined {
  if (existsSync(path)) return readFileSync(path, "utf8");
  if (existsSync(`${path}.gz`)) return gunzipSync(readFileSync(`${path}.gz`)).toString("utf8");
  return undefined;
}

/** This function gives the lines of a text without the empty lines. */
function linesOf(text: string | undefined): string[] {
  return (text ?? "").split("\n").filter((l) => l.length > 0);
}

/** This function gives the folders under a folder that have a `meta.json` file. */
function cellDirs(root: string): string[] {
  const out: string[] = [];
  const visit = (dir: string): void => {
    if (existsSync(join(dir, "meta.json"))) out.push(dir);
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) visit(p);
    }
  };
  visit(resolve(root));
  return out.sort();
}

/** This function gives the id of a cell: the system and the major version of node, for example `linux-node26`. */
function cellId(meta: Meta): string {
  return `${meta.os}-node${meta.node.replace(/^v/, "").split(".")[0]}`;
}

/** This function reads the cells of a folder, in the order of their ids. */
function readCells(root: string, file: string): Cell[] {
  const cells = cellDirs(root)
    .filter((dir) => existsSync(join(dir, file)))
    .map((dir) => {
      const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as Meta;
      const rows = new Map<string, Row>();
      for (const l of linesOf(readText(join(dir, file)))) {
        const row = JSON.parse(l) as Row;
        rows.set(`${row.record}/${row.router}`, row);
      }
      return { id: cellId(meta), dir, meta, rows };
    });
  return cells.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** This function gives the map of the exact lines of a result: the key of each line and its JSON text. */
function exactMap(cell: Cell, key: string): Map<string, string> | undefined {
  const text = readText(join(cell.dir, "routes", `${key.replace("/", ".")}.txt`));
  if (text === undefined) return undefined;
  const out = new Map<string, string>();
  for (const l of linesOf(text)) {
    const tab = l.indexOf("\t");
    out.set(l.slice(0, tab), l.slice(tab + 1));
  }
  return out;
}

/** The difference of the exact results of two cells, for one input and router. */
interface RouteDiff {
  readonly key: string;
  readonly cell: string;
  readonly lines: number;
  readonly differ: number;
  readonly shape: number;
  readonly far: number;
  readonly near: number;
  readonly maxAbs: number;
  readonly maxUlps: string;
  readonly first: { readonly line: string; readonly path: string; readonly ref: unknown; readonly cell: unknown; readonly ulps: string | null } | undefined;
  readonly orders: readonly string[];
  /** For each line that is a list (the levels, the bundles, the runs): the count of its items that differ, and its length. */
  readonly items: readonly string[];
  readonly verdict: "same" | "ulps" | "decision";
}

/** A move of more than this distance, in the units of the board, is a change of a decision, not a rounding of the last bits. */
const FAR = 1e-6;

/** This function compares the exact results of two cells. */
function diffRoutes(key: string, ref: Cell, cell: Cell): RouteDiff | undefined {
  const a = exactMap(ref, key);
  const b = exactMap(cell, key);
  if (a === undefined || b === undefined) return undefined;
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  let differ = 0;
  let shape = 0;
  let far = 0;
  let near = 0;
  let maxAbs = 0;
  let maxUlps = 0n;
  let first: RouteDiff["first"];
  const orders: string[] = [];
  const items: string[] = [];
  for (const k of keys) {
    const x = a.get(k);
    const y = b.get(k);
    if (x === y) continue;
    differ++;
    const w: Walk = { first: undefined, shape: false, numbers: 0, maxAbs: 0, maxUlps: 0n };
    const xv: unknown = x === undefined ? undefined : JSON.parse(x);
    const yv: unknown = y === undefined ? undefined : JSON.parse(y);
    walk(xv, yv, "", w);
    if (Array.isArray(xv) && Array.isArray(yv)) {
      let n = 0;
      for (let i = 0; i < Math.max(xv.length, yv.length); i++) if (JSON.stringify(xv[i]) !== JSON.stringify(yv[i])) n++;
      items.push(`${k}: ${n} of ${xv.length}`);
    }
    if (x === undefined || y === undefined) w.shape = true;
    if (w.shape) shape++;
    else if (w.maxAbs > FAR) far++;
    else near++;
    if (w.shape && (k === "bundles" || k === "runs")) orders.push(k);
    maxAbs = Math.max(maxAbs, w.maxAbs);
    if (w.maxUlps > maxUlps) maxUlps = w.maxUlps;
    if (first === undefined && w.first !== undefined) {
      const f = w.first;
      first = { line: k, path: f.path, ref: f.a, cell: f.b, ulps: typeof f.a === "number" && typeof f.b === "number" ? ulps(f.a, f.b).toString() : null };
    }
  }
  const verdict = differ === 0 ? "same" : shape > 0 || far > 0 ? "decision" : "ulps";
  return { key, cell: cell.id, lines: keys.length, differ, shape, far, near, maxAbs, maxUlps: maxUlps.toString(), first, orders, items, verdict };
}

/** This function gives the first chunk of the call logs of two cells that differs, or nothing when the logs are equal. */
function firstChunk(key: string, ref: Cell, cell: Cell): number | undefined {
  const a = linesOf(readText(join(ref.dir, "calls", `${key.replace("/", ".")}.txt`)));
  const b = linesOf(readText(join(cell.dir, "calls", `${key.replace("/", ".")}.txt`)));
  if (a.length === 0 || b.length === 0) return undefined;
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return i;
  return undefined;
}

/** The first call that differs in the near logs of two cells. */
interface CallDiff {
  readonly key: string;
  readonly cell: string;
  readonly i: number;
  readonly sameArgs: boolean;
  readonly fn: string;
  readonly cellFn: string;
  readonly args: readonly string[];
  readonly values: readonly (number | null)[];
  readonly cellArgs: readonly string[];
  readonly ref: { readonly bits: string; readonly value: number };
  readonly other: { readonly bits: string; readonly value: number };
  readonly ulps: string;
  readonly at: readonly string[];
  readonly cellAt: readonly string[];
}

/** This function reads the near log of a cell for one input and router. */
function nearCalls(dir: string, key: string): NearCall[] {
  return linesOf(readText(join(dir, "near", `${key.replace("/", ".")}.jsonl`))).map((l) => JSON.parse(l) as NearCall);
}

/** This function gives the first call that differs in the near logs of two cells. */
function firstCall(key: string, refDir: string, cell: string, cellDir: string): CallDiff | undefined {
  const a = new Map(nearCalls(refDir, key).map((c) => [c.i, c]));
  const b = new Map(nearCalls(cellDir, key).map((c) => [c.i, c]));
  const ids = [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y);
  for (const i of ids) {
    const x = a.get(i);
    const y = b.get(i);
    if (x === undefined || y === undefined) continue;
    if (x.fn === y.fn && x.result === y.result && x.args.join() === y.args.join()) continue;
    const sameArgs = x.fn === y.fn && x.args.join() === y.args.join();
    const rv = fromBits(x.result);
    const cv = fromBits(y.result);
    return {
      key,
      cell,
      i,
      sameArgs,
      fn: x.fn,
      cellFn: y.fn,
      args: x.args,
      values: x.values,
      cellArgs: y.args,
      ref: { bits: x.result, value: rv },
      other: { bits: y.result, value: cv },
      ulps: ulps(rv, cv).toString(),
      at: x.at,
      cellAt: y.at,
    };
  }
  return undefined;
}

/** This function gives a letter for each value: the same letter for the same value, and "-" for a missing value. */
function letters(values: readonly (string | undefined)[]): string {
  const seen = new Map<string, string>();
  return values
    .map((v) => {
      if (v === undefined) return "-";
      if (!seen.has(v)) seen.set(v, String.fromCharCode(65 + seen.size));
      return seen.get(v)!;
    })
    .join("");
}

/** This function gives the text of a number with all its digits. */
function num(x: unknown): string {
  return typeof x === "number" ? String(x) : String(JSON.stringify(x));
}

function main(): void {
  const args = process.argv.slice(2);
  const opt = (name: string): string | undefined => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const cells = readCells(opt("--cells") ?? "cells", "routes.jsonl");
  if (cells.length === 0) {
    console.error("xplat-summary: there is no cell with a routes.jsonl file.");
    process.exit(2);
  }
  const ref = cells.find((c) => c.id === "linux-node26") ?? cells[0]!;
  const keys = [...new Set(cells.flatMap((c) => [...c.rows.keys()]))].sort();

  // The targets of the near pass: for each input and router, the first chunk of each cell that differs from the reference.
  const targetsFile = opt("--targets");
  if (targetsFile !== undefined) {
    const targets: Record<string, number[]> = {};
    for (const key of keys)
      for (const cell of cells) {
        if (cell === ref) continue;
        const k = firstChunk(key, ref, cell);
        if (k === undefined) continue;
        const list = (targets[key] ??= []);
        if (!list.includes(k)) list.push(k);
      }
    writeFileSync(targetsFile, JSON.stringify(targets, null, 2) + "\n");
    console.log(`xplat-summary: ${Object.keys(targets).length} pairs of an input and a router have a chunk that differs.`);
    return;
  }

  const md: string[] = [];
  md.push("# XPLAT-HASH: the routes on each cell", "");
  md.push(`The reference cell is \`${ref.id}\`. Each other cell is compared with it.`, "");
  md.push("| cell | system | node | V8 | highways |", "|---|---|---|---|---|");
  for (const c of cells) md.push(`| ${c.id} | ${c.meta.os} ${c.meta.arch} | ${c.meta.node} | ${c.meta.v8} | ${c.meta.highways} |`);
  md.push("");

  // The table of the hashes.
  md.push("## The route hashes", "");
  md.push("The letters are the groups of the cells with the same route hash. `rep` is yes when the two runs and the traced run of each cell give the same hash.", "");
  md.push(`| input / router | joint linux node 26 | joint win32 node 24 | ${cells.map((c) => c.id).join(" | ")} | groups | rep |`);
  md.push(`|---|---|---|${cells.map(() => "---").join("|")}|---|---|`);
  const groupsOf: Record<string, string> = {};
  let repeatAll = true;
  for (const key of keys) {
    const rows = cells.map((c) => c.rows.get(key));
    const letters = new Map<string, string>();
    const groups = rows.map((r) => {
      if (r === undefined) return "-";
      if (!letters.has(r.hash)) letters.set(r.hash, String.fromCharCode(65 + letters.size));
      return letters.get(r.hash)!;
    });
    const rep = rows.every((r) => r === undefined || (r.hash === r.again && (r.traced === null || r.traced === r.hash)));
    repeatAll &&= rep;
    groupsOf[key] = groups.join("");
    const joint = rows.find((r) => r !== undefined)?.joint ?? {};
    md.push(`| ${key} | ${joint.linuxNode26 ?? ""} | ${joint.win32Node24 ?? ""} | ${rows.map((r) => r?.hash ?? "").join(" | ")} | ${groups.join("")} | ${rep ? "yes" : "no"} |`);
  }
  md.push("");

  // The agreement of each pair of cells.
  md.push("## The agreement of the cells", "");
  md.push("| cell | equal route hashes | equal exact results | joint hash of linux node 26 | joint hash of win32 node 24 |", "|---|---|---|---|---|");
  for (const c of cells) {
    let hashes = 0;
    let exact = 0;
    let linux = 0;
    let win = 0;
    let linuxN = 0;
    let winN = 0;
    for (const key of keys) {
      const r = c.rows.get(key);
      const q = ref.rows.get(key);
      if (r === undefined) continue;
      if (q !== undefined && r.hash === q.hash) hashes++;
      if (q !== undefined && r.exact === q.exact) exact++;
      if (r.joint.linuxNode26 !== undefined) {
        linuxN++;
        if (r.joint.linuxNode26 === r.hash) linux++;
      }
      if (r.joint.win32Node24 !== undefined) {
        winN++;
        if (r.joint.win32Node24 === r.hash) win++;
      }
    }
    md.push(`| ${c.id} | ${hashes} of ${keys.length} | ${exact} of ${keys.length} | ${linux} of ${linuxN} | ${win} of ${winN} |`);
  }
  md.push("");

  // The agreement of each pair of cells: the route hashes, the exact results and the call logs.
  md.push("| pair of cells | equal route hashes | equal exact results | equal call logs |", "|---|---|---|---|");
  for (let i = 0; i < cells.length; i++)
    for (let j = i + 1; j < cells.length; j++) {
      const x = cells[i]!;
      const y = cells[j]!;
      let hashes = 0;
      let exact = 0;
      let logs = 0;
      let both = 0;
      for (const key of keys) {
        const r = x.rows.get(key);
        const q = y.rows.get(key);
        if (r === undefined || q === undefined) continue;
        both++;
        if (r.hash === q.hash) hashes++;
        if (r.exact === q.exact) exact++;
        const stem = `${key.replace("/", ".")}.txt`;
        const lx = readText(join(x.dir, "calls", stem));
        if (lx !== undefined && lx === readText(join(y.dir, "calls", stem))) logs++;
      }
      md.push(`| ${x.id} and ${y.id} | ${hashes} of ${both} | ${exact} of ${both} | ${logs} of ${both} |`);
    }
  md.push("");

  // The sort probe.
  const probes = cells.map((c) => {
    const text = readText(join(c.dir, "sort.json"));
    return text === undefined ? undefined : (JSON.parse(text) as Record<string, { readonly pairs: string; readonly cycle: string }>);
  });
  const lengths = [...new Set(probes.flatMap((p) => Object.keys(p ?? {})))].sort((a, b) => Number(a) - Number(b));
  if (lengths.length > 0) {
    md.push("## The sort probe", "");
    md.push(
      "Each cell sorts a fixed shuffle of n numbers. `pairs` groups the cells by the pairs that the engine gives to the compare function. `cycle` groups them by the result of a compare function without a total order.",
      "",
    );
    md.push(`| n | pairs: ${cells.map((c) => c.id).join(", ")} | cycle: ${cells.map((c) => c.id).join(", ")} |`, "|---|---|---|");
    for (const n of lengths) md.push(`| ${n} | ${letters(probes.map((p) => p?.[n]?.pairs))} | ${letters(probes.map((p) => p?.[n]?.cycle))} |`);
    md.push("");
  }

  // The first difference of each route.
  const routeDiffs: RouteDiff[] = [];
  for (const key of keys)
    for (const cell of cells) {
      if (cell === ref) continue;
      const r = cell.rows.get(key);
      const q = ref.rows.get(key);
      if (r === undefined || q === undefined || r.exact === q.exact) continue;
      const d = diffRoutes(key, ref, cell);
      if (d !== undefined) routeDiffs.push(d);
    }
  md.push("## The first difference of each result", "");
  if (routeDiffs.length === 0) md.push("Each cell gives the exact result of the reference cell on each input and router.", "");
  else {
    md.push(
      `A line is a route of one edge, or the levels, the bundles or the runs. \`shape\` counts the lines with a different length, key or text (for example a different lane order). \`far\` counts the lines with a move above ${FAR}. \`ulps\` counts the lines with smaller moves only.`,
      "",
    );
    md.push("| input / router | cell | lines that differ | shape | far | ulps | max move | max ulps | items that differ | first line | first value: reference, cell (ulps) | verdict |");
    md.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const d of routeDiffs) {
      const f = d.first;
      const value = f === undefined ? "" : `\`${f.path}\`: ${num(f.ref)}, ${num(f.cell)}${f.ulps === null ? "" : ` (${f.ulps})`}`;
      md.push(
        `| ${d.key} | ${d.cell} | ${d.differ} of ${d.lines} | ${d.shape} | ${d.far} | ${d.near} | ${d.maxAbs.toPrecision(3)} | ${d.maxUlps} | ${d.items.join("<br>")} | ${f?.line ?? ""} | ${value} | ${d.verdict}${d.orders.length > 0 ? ` (${d.orders.join(", ")})` : ""} |`,
      );
    }
    md.push("");
  }

  // The call logs.
  const chunkDiffs: { key: string; cell: string; chunk: number | undefined }[] = [];
  for (const key of keys)
    for (const cell of cells) {
      if (cell === ref) continue;
      chunkDiffs.push({ key, cell: cell.id, chunk: firstChunk(key, ref, cell) });
    }
  md.push("## The Math calls", "");
  const totals = cells.map((c) => [...c.rows.values()].reduce((s, r) => s + (r.calls ?? 0), 0));
  md.push(`The traced runs make ${totals.map((t, i) => `${t} calls on \`${cells[i]!.id}\``).join(", ")}.`, "");
  const perFn: Record<string, number> = {};
  for (const r of ref.rows.values()) for (const [fn, n] of Object.entries(r.perFn ?? {})) perFn[fn] = (perFn[fn] ?? 0) + n;
  md.push(`On \`${ref.id}\`: ${Object.entries(perFn).sort(([, a], [, b]) => b - a).map(([fn, n]) => `\`${fn}\` ${n}`).join(", ") || "no call log"}.`, "");
  const differing = chunkDiffs.filter((c) => c.chunk !== undefined);
  md.push(`${differing.length} of ${chunkDiffs.length} pairs of a route and a cell have a call log that differs from the reference cell.`, "");

  const callDiffs: CallDiff[] = [];
  const nearRoot = opt("--near");
  if (nearRoot !== undefined) {
    const near = cellDirs(nearRoot).map((dir) => ({ dir, id: cellId(JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) as Meta) }));
    const nearRef = near.find((n) => n.id === ref.id);
    if (nearRef !== undefined)
      for (const d of differing) {
        const other = near.find((n) => n.id === d.cell);
        if (other === undefined) continue;
        const c = firstCall(d.key, nearRef.dir, d.cell, other.dir);
        if (c !== undefined) callDiffs.push(c);
      }
  }
  if (callDiffs.length > 0) {
    md.push("### The first call that differs", "");
    md.push("`same args` is yes when the two cells call the function with the same bits and get a different result. Then the Math function itself differs.", "");
    md.push("| input / router | cell | call | function | same args | arguments | result on the reference | result on the cell | ulps | frames in `src/` |");
    md.push("|---|---|---|---|---|---|---|---|---|---|");
    for (const c of callDiffs) {
      const argText = c.values.map((v, i) => `${num(v)} (\`${c.args[i]}\`)`).join(", ");
      md.push(
        `| ${c.key} | ${c.cell} | ${c.i} | ${c.fn}${c.cellFn === c.fn ? "" : ` / ${c.cellFn}`} | ${c.sameArgs ? "yes" : "no"} | ${argText} | ${num(c.ref.value)} (\`${c.ref.bits}\`) | ${num(c.other.value)} (\`${c.other.bits}\`) | ${c.ulps} | ${c.at.join("<br>")} |`,
      );
    }
    md.push("");
    // The same first call on many routes has one cause.
    const groups = new Map<string, { n: number; c: CallDiff }>();
    for (const c of callDiffs) {
      const g = `${c.fn} ${c.sameArgs} ${c.at[0] ?? ""}`;
      const had = groups.get(g);
      if (had) had.n++;
      else groups.set(g, { n: 1, c });
    }
    md.push("| function | same args | first frame | count of route and cell pairs |", "|---|---|---|---|");
    for (const { n, c } of [...groups.values()].sort((a, b) => b.n - a.n)) md.push(`| ${c.fn} | ${c.sameArgs ? "yes" : "no"} | ${c.at[0] ?? ""} | ${n} |`);
    md.push("");
  } else if (nearRoot !== undefined) md.push("The near logs have no call that differs.", "");

  md.push("## Repeats", "");
  md.push(repeatAll ? "In each cell, the two runs and the traced run of each input and router give the same hash." : "In some cell, two runs of the same input and router give different hashes. The column `rep` of the table shows them.", "");

  const text = md.join("\n");
  const outFile = opt("--out");
  if (outFile !== undefined) writeFileSync(outFile, text);
  else process.stdout.write(text);
  const jsonFile = opt("--json");
  if (jsonFile !== undefined) {
    const cellsOut = cells.map((c) => ({ id: c.id, meta: c.meta, rows: [...c.rows.values()] }));
    writeFileSync(jsonFile, JSON.stringify({ ref: ref.id, cells: cellsOut, groups: groupsOf, repeatAll, routeDiffs, chunkDiffs, callDiffs, probes }, null, 2) + "\n");
  }
}

main();
