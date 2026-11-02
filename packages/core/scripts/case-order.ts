// The case-order run (BENCH-FRESH-CASES step 1): does the heap of earlier cases in one process change the time of a later case?
// The workflow `Case order` (.github/workflows/case-order.yml) starts it. Times run in CI only, not on a local machine.
//
// - One job: `node scripts/case-order.ts --target <screen|levels|portfolio-speed> --out <dir> [--job <n>] [--rounds 20] [--stride <n>] [--budget <b>]`.
//   Each round starts one process of the arm in order, and two processes for each case alone (the arms `alone` and `alone-aa`).
//   The processes run one at a time. The script writes `case-order-<target>-job<n>.jsonl` (one record for each process), `.json` (the verdict) and `.md`.
// - The join: `node scripts/case-order.ts --join <dir> --target <target> --json <file> --summary <file> [--budget <b>]`.
//   It reads each file `case-order-<target>-job<n>.jsonl` below `<dir>`, and gives the verdict over the jobs.
// - The budget b: `--budget`, else the default of the plan (the screen), else no budget. The record names its source.
// - A child of the screen target: `node scripts/case-order.ts --child screen --input <id> --set <set> --paired-base <name> --paired-arms <names>
//   --paired-repeats <n> --paired <file>`. It makes only the board of the input, and times the paired arms on it as `scripts/screen.ts` does.
// `scripts/case-order-verdict.ts` has the plans, the order of the rounds and the verdict.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { envOf, measureIsolated } from "./gates/paired.ts";
import { parseReports } from "./gates/time-gate.ts";
import { CASE_TARGETS, IN_ORDER, caseVerdict, casePlan, runRounds, verdictText, type CaseRecord, type CaseTarget } from "./case-order-verdict.ts";

const SCRIPT = fileURLToPath(import.meta.url);
const HERE = resolve(SCRIPT, "..");

const args = process.argv.slice(2);
const opt = (key: string): string | undefined => {
  const i = args.indexOf(key);
  return i >= 0 ? args[i + 1] : undefined;
};
const need = (key: string): string => {
  const v = opt(key);
  if (v === undefined) throw new Error(`The option ${key} is necessary.`);
  return v;
};

/** This function starts a process and resolves when it exits with the code 0. It keeps the last part of the stderr, and prints it on a failure. */
function startProcess(argv: readonly string[]): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn(argv[0]!, argv.slice(1), { cwd: resolve(HERE, ".."), stdio: ["ignore", "ignore", "pipe"] });
    let tail = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => (tail = (tail + chunk).slice(-8000)));
    child.on("error", fail);
    child.on("close", (code) => {
      if (code === 0) return done();
      process.stderr.write(tail);
      fail(new Error(`The process ${argv.join(" ")} exited with the code ${code}.`));
    });
  });
}

/** This function is the child of the screen target. It routes only the board of one input, with the routers of the step `router`. */
async function screenChild(): Promise<void> {
  const { SCREEN_SETS, graphInput, inputGraph, inputId } = await import("../src/bench/screen/index.ts");
  const { STRATEGIES } = await import("../src/strategies/builtins.ts");
  const { asRouter, getStrategy } = await import("../src/strategies/model.ts");
  const input = need("--input");
  const set = SCREEN_SETS[need("--set")];
  if (set === undefined) throw new Error(`There is no screen set "${opt("--set")}".`);
  let graph: ReturnType<typeof inputGraph> | undefined;
  let group = "";
  for (const f of set.families)
    for (let k = 0; k < f.seeds && graph === undefined; k++) {
      if (inputId(set.id, f.name, k) !== input) continue;
      // The same steps as `screenInputs` and the paired time of `scripts/screen.ts`: the input file, then its graph.
      graph = inputGraph(graphInput(f.make(k), { id: input, set: set.id, family: f.name, seed: k, generator: f.generator(k), cell: f.cell }));
      group = f.name;
    }
  if (graph === undefined) throw new Error(`The set ${set.id} has no input "${input}".`);
  const base = need("--paired-base");
  const others = need("--paired-arms").split(",").filter((n) => n.length > 0 && n !== base);
  const arms = [base, ...others].map((id) => {
    const router = asRouter(getStrategy(STRATEGIES, "router", id) as Parameters<typeof asRouter>[0]);
    return { id, run: (g: typeof graph) => router.route(g!) };
  });
  const repeats = Number(opt("--paired-repeats") ?? "3");
  const paired = measureIsolated({ arms, inputs: [{ id: input, group, value: graph }], repeats, warmup: 1, mode: "process" });
  writeFileSync(need("--paired"), JSON.stringify(paired) + "\n");
}

/** This function gives the target of the option `--target`. */
function targetOf(): CaseTarget {
  const target = need("--target") as CaseTarget;
  if (!CASE_TARGETS.includes(target)) throw new RangeError(`There is no target "${target}". The targets are ${CASE_TARGETS.join(", ")}.`);
  return target;
}

/** This function gives the value of the option `--budget`, or `undefined`. */
function budgetInput(): number | undefined {
  const text = opt("--budget");
  return text === undefined || text.trim() === "" ? undefined : Number(text);
}

/** This function gives the plan of a target, with the paths of this computer. */
const planOf = (target: CaseTarget) => casePlan(target, { node: [process.execPath, ...process.execArgv], scripts: HERE });

/** This function writes the verdict of the records and its text, and prints the text. */
function writeVerdict(target: CaseTarget, records: readonly CaseRecord[], cases: readonly string[], json: string, md: string): void {
  const verdict = caseVerdict(planOf(target), records, cases, budgetInput());
  writeFileSync(json, JSON.stringify(verdict, null, 2) + "\n");
  const text = verdictText(verdict).join("\n") + "\n";
  writeFileSync(md, text);
  console.log(text);
}

/** This function starts the rounds of one job of a target, and writes the records, the verdict of the job and its text. */
async function run(): Promise<void> {
  const target = targetOf();
  const rounds = Number(opt("--rounds") ?? "20");
  const job = Number(opt("--job") ?? "1");
  if (!Number.isInteger(job) || job < 1) throw new RangeError("The option --job takes a whole number of 1 or more.");
  const out = resolve(need("--out"));
  mkdirSync(out, { recursive: true });
  const plan = planOf(target);
  const stride = opt("--stride") === undefined ? plan.stride : Number(opt("--stride"));
  const name = `case-order-${target}-job${job}`;
  const recordsFile = join(out, `${name}.jsonl`);
  writeFileSync(recordsFile, "");
  const work = join(out, "work");
  const { records, cases } = await runRounds(
    plan,
    rounds,
    {
      start: startProcess,
      read: (file) => (existsSync(file) ? parseReports(readFileSync(file, "utf8")) : []),
      dirOf: (round, slot) => {
        const dir = join(work, `r${round}-s${slot}`);
        rmSync(dir, { recursive: true, force: true });
        mkdirSync(dir, { recursive: true });
        return dir;
      },
      env: (arm) => envOf(arm === IN_ORDER ? "process" : "fresh"),
      // Each record goes to the file at once, so a failed run still leaves the records before it.
      keep: (record) => {
        appendFileSync(recordsFile, JSON.stringify(record) + "\n");
        rmSync(work, { recursive: true, force: true });
      },
      log: (line) => process.stderr.write(line + "\n"),
    },
    stride,
    job,
  );
  writeVerdict(target, records, cases, join(out, `${name}.json`), join(out, `${name}.md`));
}

/** This function reads the records of each job of a target below a folder, and writes the verdict over the jobs. */
function joinRun(): void {
  const target = targetOf();
  const dir = need("--join");
  const records: CaseRecord[] = [];
  for (const file of (readdirSync(dir, { recursive: true }) as string[]).sort()) {
    if (/^case-order-(.+)-job\d+\.jsonl$/.exec(basename(file))?.[1] !== target) continue;
    for (const line of readFileSync(join(dir, file), "utf8").split(/\r?\n/)) if (line.trim() !== "") records.push(JSON.parse(line) as CaseRecord);
  }
  if (records.length === 0) throw new Error(`The folder ${dir} has no records of the target ${target}.`);
  // The cases are the cases of the alone arms, in the order of their first record.
  const cases = [...new Set(records.filter((r) => r.arm !== IN_ORDER && r.input !== undefined).map((r) => r.input!))];
  writeVerdict(target, records, cases, need("--json"), need("--summary"));
}

const main = (() => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(SCRIPT);
  } catch {
    return false;
  }
})();
if (main) {
  if (opt("--child") === "screen") await screenChild();
  else if (opt("--child") !== undefined) throw new RangeError(`There is no child "${opt("--child")}". The child is screen.`);
  else if (opt("--join") !== undefined) joinRun();
  else await run();
}
