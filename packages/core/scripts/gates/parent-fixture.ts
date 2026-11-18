// The fixture of the flip `parent` (GATE-FLIP-PARENT): `node scripts/gates/parent-fixture.ts --run <id> [--arm <arm>] [--attempt <n>] [--record <file>] [--pool <file>] [--out <file>]`.
// Record the fixture again after a correct change of the verdict code, or of the format of the record. The clean arm of the flip then tells this step.
//
// - With no `--record`, the script downloads the artifact `gate-flip-sections` of the run of `Gate flip` with `gh run download`.
//   The record is `sections/<arm>-<attempt>/sections-gate.json` in that artifact. The default arm is `clean`, and the default attempt is 1.
// - The pool is `--pool`, or `data/sections-gate/aa-pool.json` of this checkout. Give the pool of the checkout of the run when the pool changed after the run.
// - `fixtureOf` of `parent-flip.ts` refuses a record that is not quiet, that does not pass or that the replay does not give again.
// - The script writes the fixture to `--out`, or to `data/gate-flip/parent-run.json`. Commit the file in a pull request.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { InputError } from "./inputs.ts";
import { PARENT_RUN_FILE, fixtureOf } from "./parent-flip.ts";
import { POOL_FILE, parsePool, type GateRecord } from "../sections-gate-verdict.ts";

/** The folder of the core package. */
const CORE = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
/** The artifact of the job `sections` of `Gate flip`. */
const FLIP_ARTIFACT = "gate-flip-sections";

/** This function reads the record of one arm from the artifact of a run. The download uses argv and no shell. */
function downloadRecord(run: number, arm: string, attempt: number): string {
  const dir = mkdtempSync(join(tmpdir(), "parent-fixture-"));
  const out = spawnSync("gh", ["run", "download", String(run), "--name", FLIP_ARTIFACT, "--dir", dir], { cwd: CORE, encoding: "utf8" });
  if (out.status !== 0) throw new InputError(`gh run download ${run} --name ${FLIP_ARTIFACT}: ${(out.stderr || String(out.error)).trim()}`);
  return join(dir, "sections", `${arm}-${attempt}`, "sections-gate.json");
}

function main(): void {
  const { values } = parseArgs({
    options: {
      run: { type: "string" },
      arm: { type: "string", default: "clean" },
      attempt: { type: "string", default: "1" },
      record: { type: "string" },
      pool: { type: "string" },
      out: { type: "string" },
    },
  });
  const run = Number(values.run);
  const attempt = Number(values.attempt);
  if (!Number.isInteger(run) || run <= 0) throw new InputError("Give the id of the run of `Gate flip` with `--run <id>`.");
  if (!Number.isInteger(attempt) || attempt <= 0) throw new InputError(`The attempt ${values.attempt} is not a whole number above 0.`);
  const recordFile = values.record ?? downloadRecord(run, values.arm, attempt);
  const record = JSON.parse(readFileSync(recordFile, "utf8")) as GateRecord;
  const pool = parsePool(readFileSync(values.pool ?? join(CORE, POOL_FILE), "utf8"));
  const fixture = fixtureOf(record, pool, { run, job: "sections", arm: values.arm, attempt });
  const out = values.out ?? join(CORE, PARENT_RUN_FILE);
  writeFileSync(out, JSON.stringify(fixture, null, 2) + "\n");
  console.log(`The fixture of the run ${run} (${values.arm} ${attempt}) is in ${out}: the home finds ${record.home?.outcome}, with the margin ${record.home?.margin}.`);
}

try {
  main();
} catch (error) {
  if (!(error instanceof InputError)) throw error;
  console.error(error.message);
  process.exitCode = 2;
}
