// A replay that scores nothing: can the jobs of the narrow read join the reference of the sentinels? Usage: node shape-join.ts <tree> <now folder> <before folder> <out.json>
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const [tree, now, before, out] = process.argv.slice(2) as [string, string, string, string];
const { SENTINELS, orderOf } = await import(`file:///${tree}/packages/core/scripts/arm-order-rows.ts`);
const median = (v: readonly number[]): number => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const mean = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0) / v.length;
const load = (d: string, run: string): any[] =>
  readdirSync(d, { recursive: true, encoding: "utf8" })
    .filter((n) => /^paired-job.*\.json$/.test(basename(n)))
    .sort()
    .map((n, k) => ({ ...JSON.parse(readFileSync(join(d, n), "utf8")), run, name: `${run}/${k + 1}` }));
const jobs = [...load(before, "before"), ...load(now, "now")];
const model = (j: any): string => /(\w+) \d+-Core/.exec(j.env.cpu)?.[1] ?? j.env.cpu;
const ids: string[] = [...SENTINELS];
const sentinel = (j: any, id: string): any => j.inputs.find((i: any) => i.id === id);
/** This function gives the logs of the medians less their own median. */
const center = (v: readonly number[]): number[] => {
  const m = median(v);
  return v.map((x) => x - m);
};
const vec = (j: any, arm = "old", pick: (round: number) => boolean = () => true): number[] =>
  center(ids.map((id) => Math.log(median(sentinel(j, id).ms[arm].filter((_: number, r: number) => pick(r))))));
const level = (j: any): number => median(ids.map((id) => Math.log(median(sentinel(j, id).ms.old))));
const shapeOf = (d: readonly number[]): number => Math.max(...center(d).map(Math.abs));
const against = (v: readonly number[], refs: readonly (readonly number[])[]): number => shapeOf(v.map((x, s) => x - mean(refs.map((r) => r[s]!))));
const f4 = (x: number): string => x.toFixed(4);
const report: Record<string, unknown> = {};

console.log("vectors, old arm, each less its own median; level is the median log ms");
console.log("job".padEnd(12), "model", "level ".padEnd(8), ids.map((id) => id.replace("-100-s0", "").padEnd(16)).join(""));
for (const j of jobs) console.log(j.name.padEnd(12), model(j), f4(level(j)).padEnd(8), vec(j).map((x) => f4(x).padEnd(16)).join(""));

const of = (m: string): any[] => jobs.filter((j) => model(j) === m);
for (const m of ["9V74", "7763"]) {
  const set = of(m);
  console.log(`\nleave one out on ${m}, ${set.length} jobs: the shape against the others, then against each one job`);
  const rows = set.map((j) => {
    const others = set.filter((o) => o !== j);
    const loo = against(vec(j), others.map((o) => vec(o)));
    const single = others.map((o) => against(vec(j), [vec(o)]));
    console.log(j.name.padEnd(12), "loo", f4(loo), "single", single.map(f4).join(" "));
    return { job: j.name, level: level(j), loo, single };
  });
  report[`loo${m}`] = rows;
  console.log("largest loo", f4(Math.max(...rows.map((r) => r.loo))), "largest single", f4(Math.max(...rows.flatMap((r) => r.single))), "median single", f4(median(rows.flatMap((r) => r.single))));
}

console.log("\nby sentinel: the mean of each run on each model, and the change between the runs");
const change: Record<string, number[]> = {};
for (const m of ["9V74", "7763"]) {
  const a = of(m).filter((j) => j.run === "before").map((j) => vec(j));
  const b = of(m).filter((j) => j.run === "now").map((j) => vec(j));
  change[m] = center(ids.map((_, s) => mean(b.map((v) => v[s]!)) - mean(a.map((v) => v[s]!))));
  console.log(m, "now less before", change[m]!.map(f4).join(" "), "jobs", a.length, b.length);
}
const pair = change["9V74"]!.map((x, s) => [x, change["7763"]![s]!] as const);
const sx = Math.sqrt(mean(pair.map(([x]) => x * x)));
const sy = Math.sqrt(mean(pair.map(([, y]) => y * y)));
console.log("the two changes, correlation", f4(mean(pair.map(([x, y]) => x * y)) / (sx * sy)), "of 6 sentinels, centred");
report["change"] = change;

console.log("\nposition of the old arm in a round, by order");
const rounds = sentinel(jobs[0], ids[0]).ms.old.length as number;
for (const run of ["before", "now"]) {
  const j = jobs.find((x) => x.run === run)!;
  console.log(run, Array.from({ length: rounds }, (_, r) => orderOf(j, r).indexOf("old")).join(" "), "aa", Array.from({ length: rounds }, (_, r) => orderOf(j, r).indexOf("old~aa")).join(" "), "order field", j.order ?? "none");
}

console.log("\nwithin one job, same computer: old against old~aa (other positions, same code), and first half against second half of the old arm (placebo with the same positions mix)");
const within = jobs.map((j) => {
  const twin = shapeOf(vec(j).map((x, s) => x - vec(j, "old~aa")[s]!));
  const pos = (k: number) => (r: number) => orderOf(j, r).indexOf("old") === k;
  const byPos = [0, 1, 2].map((k) => Array.from({ length: rounds }, (_, r) => r).filter(pos(k)).length);
  const first = shapeOf(vec(j, "old", pos(0)).map((x, s) => x - vec(j, "old", pos(2))[s]!));
  const odd = shapeOf(vec(j, "old", (r) => r % 2 === 0).map((x, s) => x - vec(j, "old", (r) => r % 2 === 1)[s]!));
  console.log(j.name.padEnd(12), model(j), "old vs aa", f4(twin), "pos 0 vs pos 2", f4(first), "even vs odd rounds", f4(odd), "rounds by pos", byPos.join(","));
  return { job: j.name, twin, first, odd, byPos };
});
report["within"] = within;
const byRun = (run: string, key: "twin" | "first" | "odd"): string => f4(median(within.filter((w) => w.job.startsWith(run)).map((w) => w[key])));
for (const run of ["before", "now"]) console.log(run, "medians: old vs aa", byRun(run, "twin"), "pos 0 vs pos 2", byRun(run, "first"), "even vs odd", byRun(run, "odd"));

console.log("\nthe fault on each sentinel of each job, against the reference of that job's model, leave one out, against all other jobs of the model and against one job");
for (const f of [1.2, 1 / 1.2]) {
  for (const m of ["9V74", "7763"]) {
    const set = of(m);
    let red = 0;
    let all = 0;
    let redOne = 0;
    let allOne = 0;
    const green: string[] = [];
    for (const j of set) {
      const others = set.filter((o) => o !== j).map((o) => vec(o));
      const log = ids.map((id) => Math.log(median(sentinel(j, id).ms.old)));
      for (let s = 0; s < ids.length; s++) {
        const bad = center(log.map((x, k) => (k === s ? x + Math.log(f) : x)));
        all++;
        if (against(bad, others) > 0.12) red++;
        else green.push(`${j.name} ${ids[s]}`);
        for (const one of others) {
          allOne++;
          if (against(bad, [one]) > 0.12) redOne++;
        }
      }
    }
    console.log(`factor ${f.toFixed(3)} ${m}: all others red ${red} of ${all}, one job red ${redOne} of ${allOne}`, green.join("; "));
    report[`fault ${f.toFixed(3)} ${m}`] = { red, all, redOne, allOne, green };
  }
}
writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
