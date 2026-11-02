// The plans, the join and the verdicts of the workflow `Remeasure` (MEASURE-ISOLATE).
// The workflow measures the void speed claims again: an old version against the workspace, in one job, with the A/A arm.
// Each of the 5 jobs writes one `paired-time/1` report. These functions join the 5 reports and give a verdict for each target of a claim.
// This module imports only node modules and the gates, so a job with no installed packages can start it.
import { aaId, quantileOf, type Mode, type PairedReport } from "./gates/paired.ts";
import { InputError, requireInputs } from "./gates/inputs.ts";
import { insideFloor, type NoiseBand } from "./gates/time-gate.ts";

/** The claims that the workflow measures again, as the values of its input `claim`. */
export const CLAIMS = ["h3", "portfolio-speed", "route-scale"] as const;

/** One claim that the workflow measures again. */
export type Claim = (typeof CLAIMS)[number];

/** The id of the base arm: the old version. Each ratio has its time below the line. */
export const OLD_ARM = "old";
/** The id of the arm of the workspace. */
export const NEW_ARM = "workspace";
/** The count of the jobs of each claim. Each job writes one report. */
export const REMEASURE_JOBS = 5;

/** The routers of H3: the routers of `fa1dd82~1` with a node limit of 10 000. */
export const H3_ROUTERS = ["corners", "corners-smooth", "trunks", "shared", "shared-all", "sections", "sections-tree"] as const;
/** The fixture of H3: 10 000 nodes in clusters. */
export const H3_FIXTURE = "large-clustered";
/** The routers of ROUTE-SCALE on the dense board. */
export const ROUTE_SCALE_ROUTERS = ["shared", "shared-all", "portfolio"] as const;
/** The node counts of the exact boards of PORTFOLIO-SPEED. The counts 41 to 64 make the band `n41-64`. */
export const PORTFOLIO_SPEED_NODES = [41, 52, 64, 100] as const;
/** The seeds of each class of the exact boards of PORTFOLIO-SPEED. */
export const PORTFOLIO_SPEED_SEEDS = [0, 1, 2] as const;

/** This function gives the band of an exact board of PORTFOLIO-SPEED: `n41-64` or `n100`. */
export const portfolioSpeedBand = (nodes: number): string => (nodes <= 64 ? "n41-64" : `n${nodes}`);

/** One target of a claim: a set of inputs of the report, and the claimed ratio of the workspace over the old version. */
export interface Target {
  /** The id of the target. The inputs of the target have this id as their group. */
  readonly id: string;
  /** The claimed ratio of the workspace time over the old time. The value `null` tells that the row gives no ratio. */
  readonly claim: number | null;
  /** The text of the claim in the row of `docs/ROADMAP.md`. */
  readonly source: string;
}

/** The plan of one claim: the old arm, the board, the mode and the targets. */
export interface ClaimPlan {
  readonly claim: Claim;
  /** The rows of `docs/ROADMAP.md` that give the claim. */
  readonly rows: readonly string[];
  /** The old arm, as text. */
  readonly old: string;
  /** The board, as text. */
  readonly board: string;
  readonly mode: Mode;
  /** The timed rounds of each arm on each input. */
  readonly rounds: number;
  /** The untimed runs of each arm before its timed run. */
  readonly warmup: number;
  readonly targets: readonly Target[];
}

/** The plan of each claim. The claimed ratios come from the rows of `docs/ROADMAP.md`. */
export const CLAIM_PLANS: Readonly<Record<Claim, ClaimPlan>> = {
  h3: {
    claim: "h3",
    rows: ["H3"],
    old: "the core of `fa1dd82~1` (`0dff3fd`), in a git worktree",
    board: `the fixture \`${H3_FIXTURE}\` of \`fa1dd82~1\` (10 000 nodes)`,
    mode: "fresh",
    rounds: 3,
    warmup: 0,
    // The row: "each router 2 to 2.5 times faster at 10 000 nodes". The claimed ratio is the low end, 1 / 2.
    targets: H3_ROUTERS.map((id) => ({ id, claim: 1 / 2, source: "H3: each router 2 to 2.5 times faster at 10 000 nodes" })),
  },
  "portfolio-speed": {
    claim: "portfolio-speed",
    rows: ["PORTFOLIO-SPEED"],
    old: "npm `@mark1russell7/highways@0.5.1`",
    board: `the exact boards of 0.5.1 with ${PORTFOLIO_SPEED_NODES.join(", ")} nodes, each class, the seeds ${PORTFOLIO_SPEED_SEEDS.join(", ")}`,
    // Each input gets its own fresh processes (BENCH-FRESH-CASES). The record of the run 41381593646 has the mode process.
    mode: "fresh",
    rounds: 10,
    warmup: 1,
    targets: [
      { id: "setup n41-64", claim: null, source: "PORTFOLIO-SPEED: the row gives no ratio for the setup at 41 to 64 nodes" },
      { id: "setup n100", claim: 25 / 172, source: "PORTFOLIO-SPEED: the setup at 100 nodes goes from 172 to 25 ms" },
      { id: "router n41-64", claim: null, source: "PORTFOLIO-SPEED: the fit runs one member at the cap 1.5, at 39 to 46 ms (a time, not a ratio)" },
      { id: "router n100", claim: null, source: "PORTFOLIO-SPEED: the row gives no ratio for the router at 100 nodes" },
    ],
  },
  "route-scale": {
    claim: "route-scale",
    rows: ["ROUTE-SCALE", "REL15"],
    old: "npm `@mark1russell7/highways@0.8.0`",
    board: "the dense board of 1000 boxes and 4000 edges (`data/scale/route-scale-fixture.json.gz`)",
    mode: "fresh",
    rounds: 3,
    warmup: 0,
    targets: [
      { id: "shared", claim: 21 / 302, source: "ROUTE-SCALE: `shared` goes from 302 s to 21 s" },
      { id: "shared-all", claim: 1 / 10, source: "REL15: approximately 10 times faster with `shared-all`" },
      { id: "portfolio", claim: 28 / 300, source: "ROUTE-SCALE: `portfolio` goes from 300 s to 28 s" },
    ],
  },
};

/** This function reads the input `claim`. The case of the letters does not count. A value that is not a claim throws a `RangeError`. */
export function parseClaim(text: string | undefined): Claim {
  const value = (text ?? "").trim().toLowerCase();
  if ((CLAIMS as readonly string[]).includes(value)) return value as Claim;
  throw new RangeError(`There is no claim "${text ?? ""}". The claims are ${CLAIMS.join(", ")}.`);
}

/** This function gives the names of the jobs of a claim: `job1` to `job5`. */
export const jobNames = (jobs: number = REMEASURE_JOBS): string[] => Array.from({ length: jobs }, (_, i) => `job${i + 1}`);

/** This function gives the name of the report file of a job: `paired-job3.json`. */
export const reportFile = (job: number): string => `paired-job${job}.json`;

/** This function gives the job of a report file, for example `job3` for `paired-job3.json`. Another name gives `undefined`. */
export function jobOfFile(file: string): string | undefined {
  const match = /(?:^|[\\/])paired-(job[1-9][0-9]*)\.json$/.exec(file);
  return match?.[1];
}

/** The report of one job. */
export interface JobEntry {
  readonly job: string;
  readonly report: PairedReport;
}

/** The values of one target in one job. */
export interface TargetJob {
  readonly job: string;
  readonly cpu: string;
  /** The median over the inputs of the target of the ratio of the workspace over the old version. */
  readonly ratio: number;
  /** The noise floor of the job: p10 to p90 of the A/A ratios of the whole report. */
  readonly floor: NoiseBand;
  /** This value is `true` when the ratio is inside the noise floor. */
  readonly inside: boolean;
  /** The median over the inputs of the target of the median time of each arm, in ms. */
  readonly oldMs: number;
  readonly newMs: number;
}

/** The verdict of one target, or of one claim. */
export type Verdict = "holds" | "smaller" | "inside the noise floor" | "outside the noise floor, no claimed ratio" | `cannot decide (${string})`;

/** The result of one target over the jobs. */
export interface TargetResult {
  readonly target: Target;
  readonly jobs: readonly TargetJob[];
  /** The highest ratio over the jobs: the smallest effect. */
  readonly worst: number;
  /** The count of the jobs with a ratio above the noise floor, where the workspace is slower. */
  readonly slower: number;
  readonly verdict: Verdict;
}

/** The joined record of the jobs of one claim, with the schema `remeasure/1`. */
export interface Joined {
  readonly schema: "remeasure/1";
  readonly claim: Claim;
  readonly plan: ClaimPlan;
  /** The computer of each job, in the order of the jobs. */
  readonly jobs: readonly { readonly job: string; readonly cpu: string; readonly cores: number; readonly mode: Mode; readonly floor: NoiseBand }[];
  readonly targets: readonly TargetResult[];
  /** The verdict over the targets with a claimed ratio. */
  readonly verdict: Verdict | "no claimed ratio";
}

/** This function gives the count of the jobs against the policy, for example "1 job of 5". */
const jobsOf = (jobs: number, policy: number): string => `${jobs} ${jobs === 1 ? "job" : "jobs"} of ${policy}`;

/**
 * This function gives the verdict of one target from its values in each job.
 *
 * - With fewer jobs than the policy, the verdict is "cannot decide (1 job of 5)", with the real counts.
 * - A ratio inside the noise floor in one job or more gives "inside the noise floor".
 * - Else, a target with no claimed ratio gives "outside the noise floor, no claimed ratio".
 * - Else, "holds" needs each ratio below the floor and at the claimed ratio or below. Other values give "smaller".
 */
export function targetVerdict(claim: number | null, rows: readonly { readonly ratio: number; readonly floor: NoiseBand }[], policy: number = REMEASURE_JOBS): Verdict {
  if (rows.length < policy) return `cannot decide (${jobsOf(rows.length, policy)})`;
  if (rows.some((r) => !Number.isFinite(r.ratio) || insideFloor(r.ratio, r.floor))) return "inside the noise floor";
  if (claim === null) return "outside the noise floor, no claimed ratio";
  return rows.every((r) => r.ratio < r.floor.p10 && r.ratio <= claim) ? "holds" : "smaller";
}

/** This function gives the verdict of a claim from the verdicts of its targets with a claimed ratio. The weakest verdict wins. */
export function claimVerdict(results: readonly { readonly target: Target; readonly verdict: Verdict }[]): Verdict | "no claimed ratio" {
  const claimed = results.filter((r) => r.target.claim !== null).map((r) => r.verdict);
  if (claimed.length === 0) return "no claimed ratio";
  const undecided = claimed.find((v) => v.startsWith("cannot decide"));
  if (undecided !== undefined) return undecided;
  if (claimed.includes("inside the noise floor")) return "inside the noise floor";
  if (claimed.includes("smaller")) return "smaller";
  return "holds";
}

/** This function checks that a report fits the plan: the schema, the mode, the base, the arms and the noise floor. It throws an `InputError`. */
function checkReport(plan: ClaimPlan, e: JobEntry): void {
  const r = e.report;
  const name = `Remeasure ${plan.claim}, ${e.job}`;
  if (r?.schema !== "paired-time/1") throw new InputError(`${name}: the report is not of schema paired-time/1.`);
  if (r.mode !== plan.mode) throw new InputError(`${name}: the report has the mode ${r.mode}, and the plan has the mode ${plan.mode}.`);
  if (r.base !== OLD_ARM) throw new InputError(`${name}: the base of the report is ${r.base}, not ${OLD_ARM}.`);
  for (const arm of [NEW_ARM, aaId(OLD_ARM)]) if (!r.arms.includes(arm)) throw new InputError(`${name}: the report has no arm ${arm}.`);
  if (r.noiseFloor === null) throw new InputError(`${name}: the report has no noise floor.`);
}

/**
 * This function joins the reports of the jobs of a claim, and gives the verdict of each target (FAIL-CLOSED).
 *
 * - The jobs must be exactly `job1` to `job5`, each one time. Else the function throws an `InputError` that names the missing jobs.
 * - Each report must have the mode of the plan, the base `old`, the arm `workspace`, the A/A arm and its noise floor.
 * - Each target must have 1 input or more with a ratio in each report.
 * - The ratio of a target in a job is the median of the ratios of its inputs. The floor of a job is p10 to p90 of its A/A ratios.
 */
export function joinJobs(plan: ClaimPlan, entries: readonly JobEntry[], jobs: number = REMEASURE_JOBS): Joined {
  const name = `Remeasure ${plan.claim}`;
  const got = entries.map((e) => e.job);
  if (new Set(got).size !== got.length) throw new InputError(`${name}: a job has two reports (${got.join(", ")}).`);
  requireInputs(`${name}, the jobs`, jobNames(jobs), got);
  const sorted = [...entries].sort((a, b) => Number(a.job.slice(3)) - Number(b.job.slice(3)));
  for (const e of sorted) checkReport(plan, e);
  const targets = plan.targets.map((target): TargetResult => {
    const rows = sorted.map((e): TargetJob => {
      const r = e.report;
      const own = r.inputs.filter((i) => i.group === target.id && i.ratio[NEW_ARM] !== undefined);
      if (own.length === 0) throw new InputError(`${name}, ${e.job}: the report has no input of the target ${target.id}.`);
      const floor = { p10: r.noiseFloor!.p10, p90: r.noiseFloor!.p90 };
      const ratio = quantileOf(
        own.map((i) => i.ratio[NEW_ARM]!),
        0.5,
      );
      const msOf = (arm: string): number => quantileOf(own.map((i) => i.median[arm] ?? Number.NaN), 0.5);
      return { job: e.job, cpu: r.env.cpu, ratio, floor, inside: insideFloor(ratio, floor), oldMs: msOf(OLD_ARM), newMs: msOf(NEW_ARM) };
    });
    const worst = rows.reduce((x, r) => Math.max(x, r.ratio), Number.NEGATIVE_INFINITY);
    return { target, jobs: rows, worst, slower: rows.filter((r) => r.ratio > r.floor.p90).length, verdict: targetVerdict(target.claim, rows, jobs) };
  });
  return {
    schema: "remeasure/1",
    claim: plan.claim,
    plan,
    jobs: sorted.map((e) => ({ job: e.job, cpu: e.report.env.cpu, cores: e.report.env.cores, mode: e.report.mode, floor: { p10: e.report.noiseFloor!.p10, p90: e.report.noiseFloor!.p90 } })),
    targets,
    verdict: claimVerdict(targets),
  };
}

const fmt = (x: number, d = 3): string => (Number.isFinite(x) ? x.toFixed(d) : String(x));
/** This function writes a time in ms, or in s above 10 s. */
const time = (ms: number): string => (!Number.isFinite(ms) ? String(ms) : ms >= 10_000 ? `${fmt(ms / 1000, 1)} s` : `${fmt(ms, 1)} ms`);

/** This function gives the Markdown text of a joined record: the plan, the verdict, one row for each target and the CPU model of each job. */
export function joinText(j: Joined): string[] {
  const p = j.plan;
  const lines = [
    `# The remeasure of ${p.rows.join(" and ")}`,
    "",
    `The old arm is ${p.old}. The new arm is the workspace. The board is ${p.board}.`,
    `Each of the ${j.jobs.length} jobs times the arms in mode \`${p.mode}\`, with ${p.rounds} rounds, ${p.warmup} warm-up runs and the A/A arm.`,
    "A ratio is the median time of the workspace over the median time of the old version. Below 1, the workspace is faster.",
    "The floor of a job is p10 to p90 of its A/A ratios. Each cell gives the ratio of the job, then its floor.",
    "",
    `The verdict of the claim: **${j.verdict}**.`,
    "",
    `| target | claimed ratio | ${j.jobs.map((x) => x.job).join(" | ")} | old | workspace | verdict |`,
    `|---|---:|${j.jobs.map(() => "---:|").join("")}---:|---:|---|`,
  ];
  for (const t of j.targets) {
    const cells = t.jobs.map((r) => `${fmt(r.ratio)} (${fmt(r.floor.p10)} to ${fmt(r.floor.p90)})`);
    const oldMs = quantileOf(
      t.jobs.map((r) => r.oldMs),
      0.5,
    );
    const newMs = quantileOf(
      t.jobs.map((r) => r.newMs),
      0.5,
    );
    const slower = t.slower > 0 ? ` (the workspace is slower in ${jobsOf(t.slower, t.jobs.length)})` : "";
    lines.push(`| \`${t.target.id}\` | ${t.target.claim === null ? "-" : fmt(t.target.claim)} | ${cells.join(" | ")} | ${time(oldMs)} | ${time(newMs)} | ${t.verdict}${slower} |`);
  }
  lines.push("", "The times of the arms are the medians over the jobs. The claims:", "", ...j.targets.map((t) => `- \`${t.target.id}\`: ${t.target.source}.`));
  lines.push("", "The CPU model of each job:", "", ...j.jobs.map((x) => `- ${x.job}: ${x.cores} x ${x.cpu}, mode \`${x.mode}\`.`));
  return lines;
}
