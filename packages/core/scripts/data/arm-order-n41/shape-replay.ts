// The replay of the sentinel shape on the two runs. It scores nothing. Usage: node shape-replay.ts <tree> <now folder> <before folder>
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

const [tree, now, before] = process.argv.slice(2);
const { SENTINELS, sentinelReads, sentinelVerdict } = await import(`file:///${tree}/packages/core/scripts/arm-order-rows.ts`);
const { speedProbe } = await import(`file:///${tree}/packages/core/scripts/gates/paired.ts`);
const load = (d: string): any[] =>
  readdirSync(d, { recursive: true, encoding: "utf8" })
    .filter((n) => /^paired-job.*\.json$/.test(basename(n)))
    .sort()
    .map((n) => JSON.parse(readFileSync(join(d, n), "utf8")));
const ref = JSON.parse(readFileSync(`${tree}/packages/core/scripts/data/arm-order/sentinel-reference.json`, "utf8")).jobs;
const row = (r: any): string => `${r.job} ${r.cpu.slice(9, 13)} ref ${r.referenceJobs} level ${r.level?.toFixed(4)} shape ${r.shape?.toFixed(4)} aa ${r.aa.toFixed(4)} ${r.holds} ${r.note ?? ""}`;
const jobs = load(now!);
const reads = sentinelReads(ref, jobs);
for (const r of reads) console.log("now", row(r));
console.log(JSON.stringify(sentinelVerdict(reads)));
const was = load(before!);
was.forEach((job, k) => {
  const [r] = sentinelReads(ref.filter((_: unknown, j: number) => j !== k), [job]);
  console.log("before leave one out", k + 1, row(r));
});
// The fault of 1.2 on each sentinel of each real job, in the two directions of the sign of the noise.
const scale = (job: any, id: string, f: number): any => ({
  ...job,
  inputs: job.inputs.map((i: any) => (i.id === id ? { ...i, ms: Object.fromEntries(Object.entries(i.ms).map(([arm, ms]: any) => [arm, ms.map((m: number) => m * f)])) } : i)),
});
for (const f of [1.2, 1 / 1.2]) {
  const by: Record<string, [number, number]> = {};
  jobs.forEach((job, k) => {
    for (const id of SENTINELS) {
      const [r] = sentinelReads(ref, [scale(job, id, f)]);
      const key = r.referenceJobs === 1 ? "one-job reference" : "reference of 3";
      by[key] ??= [0, 0];
      by[key]![r.holds === false ? 0 : 1]!++;
      if (r.holds !== false) console.log("  not red at factor", f.toFixed(3), "job", k + 1, id, "shape", r.shape?.toFixed(4), "aa", r.aa.toFixed(4));
    }
  });
  console.log("fault factor", f.toFixed(3), "[red, not red]", JSON.stringify(by));
}
const t0 = performance.now();
console.log(speedProbe(), Math.round(performance.now() - t0), "ms");
