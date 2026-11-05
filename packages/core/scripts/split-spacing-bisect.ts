/**
 * This script repeats the bisect of SPLIT-SPACING, and writes its rows into the record `split-spacing/1`.
 * It checks out each commit, adds one line that logs the samples, and reads `trunks-all` on `case-many-groups`.
 * Start it from the root of a clean worktree that has its install, with the record as the first argument.
 * The script does not install the dependencies of each commit. The install of this worktree reads all these commits.
 * The script goes back to the first commit at its end.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import type { BisectRow } from "./split-spacing-rows.ts";

/** The commits, oldest first. `dd6e001` is LANE-ROOM, `ecfc238` is the counter, and `5e8b15d` is the base of this read. */
const COMMITS = ["c5ed085", "41f402b", "ff3007b", "8f4429f", "90ceb19", "dd6e001", "ecfc238", "5e8b15d"];
const MEASURE = "packages/core/src/bench/curves.ts";
const READ = "packages/core/scripts/_spacing-read.ts";
const OUT = process.argv[2]!;
const ANCHOR = "            worst = Math.max(worst, err);\n";

/** This text reads one commit. The rows `rounded` come first in the log, so the read skips their samples. */
const READ_TEXT = `import { benchHighways } from "../src/bench/curves.ts";
import { CASES } from "../src/cases.ts";
import { trunksRouter } from "../src/routers/trunks.ts";
const board = CASES.find((c) => c.name === "case-many-groups")!;
const out = [];
for (const leave of ["split", "part"] as const) {
  (globalThis as any).__log = [];
  const rows = benchHighways(trunksRouter({ name: "trunks-all", rule: (() => "all") as never, leave }), board.name, board.make());
  const rounded = rows[0] as any;
  const highway = rows[1] as any;
  const log = (globalThis as any).__log.slice(rounded.samples, rounded.samples + highway.samples);
  const top = log.reduce((a: any, s: any) => (a && a.err >= s.err ? a : s), null);
  out.push({ leave, samples: highway.samples, worst: highway.worstSpacing, mean: highway.meanSpacing, overWide: log.filter((s: any) => s.err > 0.25).length, top });
}
console.log(JSON.stringify(out));
`;

const git = (...args: string[]): string => execFileSync("git", args, { encoding: "utf8" }).trim();
const round = (value: number): number => Math.round(value * 1e6) / 1e6;

if (git("status", "--porcelain", "--untracked-files=no") !== "") throw new Error("The worktree has changes. Start this script in a clean worktree.");
const start = git("rev-parse", "--abbrev-ref", "HEAD");
const startRef = start === "HEAD" ? git("rev-parse", "HEAD") : start;
const rows: BisectRow[] = [];
try {
  for (const commit of COMMITS) {
    git("checkout", "-q", "--detach", commit);
    const source = readFileSync(MEASURE, "utf8");
    const onGap = source.includes("const gap = b.gaps[");
    const denominator = onGap ? "gap" : "sp";
    if (source.split(ANCHOR).length !== 2) throw new Error(`The measure of ${commit} has no single place for the log.`);
    const line = `            ((globalThis as any).__log ??= []).push({ err, d, denominator: ${denominator}, e: [b.edges[x], b.edges[y]] });\n`;
    writeFileSync(MEASURE, source.replace(ANCHOR, ANCHOR + line));
    writeFileSync(READ, READ_TEXT);
    const read = JSON.parse(execFileSync("node", [READ], { encoding: "utf8" })) as {
      leave: BisectRow["leave"];
      samples: number;
      worst: number;
      mean: number;
      overWide: number;
      top: { d: number; denominator: number; e: string[] };
    }[];
    rmSync(READ);
    git("checkout", "-q", "--", MEASURE);
    for (const r of read) {
      rows.push({
        commit,
        leave: r.leave,
        method: onGap ? "pair-gap" : "fixed-spacing",
        samples: r.samples,
        worst: round(r.worst),
        mean: round(r.mean),
        overWide: r.overWide,
        worstSample: { lanes: r.top.e, distance: round(r.top.d), denominator: round(r.top.denominator) },
      });
      console.log(commit, r.leave, onGap ? "pair-gap" : "fixed-spacing", r.samples, round(r.worst), round(r.mean), r.overWide, r.top.e.join("|"), round(r.top.d), round(r.top.denominator));
    }
  }
} finally {
  rmSync(READ, { force: true });
  git("checkout", "-q", "--", MEASURE);
  git("checkout", "-q", startRef);
}
const record = JSON.parse(readFileSync(OUT, "utf8")) as Record<string, unknown>;
writeFileSync(OUT, `${JSON.stringify({ ...record, bisect: rows }, null, 1)}\n`);
