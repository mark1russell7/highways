import { describe, expect, it } from "vitest";
import { InputError } from "./gates/inputs.ts";
import { aaId, pairedReport, type RawTimes } from "./gates/paired.ts";
import {
  BASE_ARM,
  BISECT_ROUTERS,
  BISECT_SHARDS,
  SHARD_SCHEMA,
  aaRounds,
  aaSpread,
  bisectText,
  classify,
  joinShards,
  parseLog,
  parseRounds,
  parseRouters,
  shardFile,
  shardOf,
  shardOfFile,
  shardText,
  type Candidate,
  type ShardRecord,
  type Skipped,
} from "./sections-bisect-verdict.ts";

// Made-up reports only. No test reads a clock.
/** This function gives a made-up full hash with a unique short hash: `a000001...` for the candidate 1. */
const sha = (i: number): string => (0xa000000 + i).toString(16).padEnd(40, "0");
const BASE = "b".repeat(40);
const HEAD = "e".repeat(40);
/** The A/A factors of the 3 rounds. The spread is p90 of 0.02, 0, 0.02 over each job: 0.02. */
const AA = [0.98, 1.0, 1.02];
const ROUTERS = ["sections-tree", "sections"] as const;

/** This function gives the made-up order of `n` candidates. */
const orderOf = (n: number): Candidate[] => Array.from({ length: n }, (_, i) => ({ commit: sha(i), subject: `feat(core): made-up change ${i}` }));

/** The ratio of a candidate in a made-up history. */
type Level = (router: string, index: number) => number;

/** The made-up history: `sections-tree` takes 2.8 times the base from the candidate 4, and `sections` 1.25 times from the candidate 6. */
const STEPS: Level = (router, i) => (router === "sections-tree" ? (i >= 4 ? 2.8 : 1) : i >= 6 ? 1.25 : 1);

/** This function gives the made-up record of one job. The base takes 100 ms in each round, and a candidate takes `level` times that. */
function fakeShard(order: readonly Candidate[], shard: number, shards: number, level: Level = STEPS, skipped: readonly Skipped[] = [], cpu = `CPU ${shard}`): ShardRecord {
  const commits = shardOf(order, shard, shards).map((c) => c.commit);
  const timed = commits.filter((c) => !skipped.some((s) => s.commit === c));
  const arms = [{ id: BASE_ARM }, ...timed.map((id) => ({ id })), { id: aaId(BASE_ARM) }];
  const inputs = ROUTERS.map((id) => ({ id, group: id }));
  const raw: RawTimes = { ms: new Map(), peak: new Map(inputs.map((x) => [x.id, new Map()])) };
  for (const router of ROUTERS) {
    const ms = new Map<string, number[]>([
      [BASE_ARM, [100, 100, 100]],
      [aaId(BASE_ARM), AA.map((f) => 100 * f)],
    ]);
    for (const c of timed) ms.set(c, [100, 100, 100].map((x) => x * level(router, order.findIndex((o) => o.commit === c))));
    raw.ms.set(router, ms);
  }
  const report = timed.length === 0 ? null : pairedReport("fresh", { cpu, cores: 4, os: "test", arch: "x64", node: "v0" }, "test", arms, inputs, raw);
  return {
    schema: SHARD_SCHEMA,
    shard,
    shards,
    head: HEAD,
    base: BASE,
    fixture: "large-clustered",
    routers: [...ROUTERS],
    rounds: 3,
    order,
    commits,
    skipped,
    env: { cpu, cores: 4, os: "test", arch: "x64", node: "v0", mode: "fresh", context: "test" },
    report,
  };
}

/** This function gives the records of each job of a made-up run. */
const allShards = (n: number, shards: number, level: Level = STEPS): ShardRecord[] => Array.from({ length: shards }, (_, i) => fakeShard(orderOf(n), i + 1, shards, level));

describe("the inputs of the workflow", () => {
  it("reads the routers, and refuses an unknown or a repeated router", () => {
    expect(parseRouters(BISECT_ROUTERS.join(","))).toEqual(["sections-tree", "sections"]);
    expect(parseRouters(" sections , sections-tree ")).toEqual(["sections", "sections-tree"]);
    expect(() => parseRouters("")).toThrow(RangeError);
    expect(() => parseRouters("sections,nope")).toThrow(RangeError);
    expect(() => parseRouters("sections,sections")).toThrow(RangeError);
  });

  it("reads the rounds as a whole number from 1 to 20", () => {
    expect(parseRounds("3")).toBe(3);
    expect(parseRounds(" 20 ")).toBe(20);
    for (const bad of ["0", "21", "2.5", "x", ""]) expect(() => parseRounds(bad)).toThrow(RangeError);
  });
});

describe("the candidates", () => {
  it("reads the git log in its order, with LF and CRLF line ends", () => {
    const text = `${sha(0)}\tperf(core): one\r\n${sha(1)}\tfix(core): two | three\n\n`;
    expect(parseLog(text)).toEqual([
      { commit: sha(0), subject: "perf(core): one" },
      { commit: sha(1), subject: "fix(core): two | three" },
    ]);
  });

  it("refuses a line with no full hash, and a commit two times", () => {
    expect(() => parseLog("abc1234\tshort hash")).toThrow(InputError);
    expect(() => parseLog(`${sha(0)}\tone\n${sha(0)}\tone`)).toThrow(InputError);
  });

  it("gives each candidate to exactly one job, in turn", () => {
    const order = orderOf(100);
    const shares = Array.from({ length: BISECT_SHARDS }, (_, i) => shardOf(order, i + 1, BISECT_SHARDS));
    expect(shares.map((s) => s.length)).toEqual([12, 11, 11, 11, 11, 11, 11, 11, 11]);
    expect(shares.flat().map((c) => c.commit).sort()).toEqual(order.map((c) => c.commit).sort());
    expect(shares[1]!.slice(0, 2).map((c) => c.commit)).toEqual([sha(1), sha(10)]);
    expect(() => shardOf(order, 0, 9)).toThrow(RangeError);
    expect(() => shardOf(order, 10, 9)).toThrow(RangeError);
  });

  it("names the record file of a job, and reads the job from a path", () => {
    expect(shardFile(3)).toBe("bisect-shard3.json");
    expect(shardOfFile("sections-bisect-shard3/bisect-shard3.json")).toBe(3);
    expect(shardOfFile("x\\bisect-shard12.json")).toBe(12);
    expect(shardOfFile("bisect-shard0.json")).toBeUndefined();
    expect(shardOfFile("board.json")).toBeUndefined();
  });
});

describe("the A/A band", () => {
  it("gives one A/A ratio for each round, and the spread as p90 of |r - 1|", () => {
    const r = fakeShard(orderOf(3), 1, 1).report!;
    expect(aaRounds(r, "sections")).toEqual(AA);
    expect(aaRounds(r, "nope")).toEqual([]);
    expect(aaSpread(AA)).toBeCloseTo(0.02, 10);
    expect(aaSpread([])).toBeNaN();
  });

  it("compares a ratio with the band of the base, and keeps an edge inside", () => {
    expect(classify(1.05, 0.05)).toBe("inside");
    expect(classify(1.051, 0.05)).toBe("slower");
    expect(classify(0.949, 0.05)).toBe("faster");
    expect(classify(null, 0.05)).toBe("not measured");
    expect(classify(1.5, Number.NaN)).toBe("not measured");
  });
});

describe("the join", () => {
  it("finds the first slower candidate of each router, from the ratios against the base of each job", () => {
    const j = joinShards(allShards(9, 3), 3);
    expect(j.complete).toBe(true);
    expect(j.candidates).toBe(9);
    expect(j.missing).toEqual([]);
    const tree = j.routers.find((x) => x.router === "sections-tree")!;
    const sections = j.routers.find((x) => x.router === "sections")!;
    expect(tree.spread).toBeCloseTo(0.02, 10);
    expect(tree.aaCount).toBe(9);
    expect(tree.first).toBe(sha(4));
    expect(tree.before).toBe(sha(3));
    expect(tree.unmeasured).toBe(0);
    expect(tree.held).toBe(sha(4));
    expect(tree.steps.map((s) => s.commit)).toEqual([sha(4)]);
    expect(tree.steps[0]!.from).toBe(1);
    expect(tree.steps[0]!.to).toBeCloseTo(2.8, 10);
    expect(sections.first).toBe(sha(6));
    expect(sections.held).toBe(sha(6));
    expect(tree.rows.map((r) => r.verdict)).toEqual(["inside", "inside", "inside", "inside", "slower", "slower", "slower", "slower", "slower"]);
    expect(tree.rows[4]!.shard).toBe(2);
    expect(tree.rows[4]!.band).toEqual({ lo: 0.98, hi: 1.02 });
  });

  it("names the base as the last time before the change, when the first candidate is slower", () => {
    const j = joinShards(allShards(6, 2, () => 3), 2);
    const tree = j.routers[0]!;
    expect(tree.first).toBe(sha(0));
    expect(tree.before).toBe(BASE);
    expect(tree.unmeasured).toBe(0);
    expect(bisectText(j).join("\n")).toContain("ratio 3.000");
  });

  it("gives no first candidate when no ratio leaves the band", () => {
    const j = joinShards(allShards(6, 2, () => 1.01), 2);
    for (const x of j.routers) {
      expect(x.first).toBeNull();
      expect(x.held).toBeNull();
      expect(x.steps).toEqual([]);
    }
    expect(bisectText(j).join("\n")).toContain("No candidate is slower than the band of the base.");
  });

  it("keeps a lone slow candidate apart from the last run of slower candidates", () => {
    const level: Level = (_, i) => (i === 1 ? 1.5 : i >= 5 ? 2.8 : 1);
    const tree = joinShards(allShards(8, 2, level), 2).routers[0]!;
    expect(tree.first).toBe(sha(1));
    expect(tree.held).toBe(sha(5));
    expect(tree.steps.map((s) => s.commit)).toEqual([sha(1), sha(2), sha(5)]);
  });

  it("gives the range of the change when a job has no record", () => {
    // With 3 jobs, the job 2 has the candidates 1, 4 and 7. The change of sections-tree is at 4.
    const records = allShards(9, 3).filter((r) => r.shard !== 2);
    const j = joinShards(records, 3);
    expect(j.complete).toBe(false);
    expect(j.missing).toEqual([2]);
    const tree = j.routers.find((x) => x.router === "sections-tree")!;
    expect(tree.rows[4]!.verdict).toBe("not measured");
    expect(tree.first).toBe(sha(5));
    expect(tree.before).toBe(sha(3));
    expect(tree.unmeasured).toBe(1);
    const text = bisectText(j).join("\n");
    expect(text).toContain("**The record is not complete.**");
    expect(text).toContain("The job 2 has no record.");
    expect(text).toContain("1 candidate between `a000003` and `a000005` has no time. The change is in it, or in `a000005`.");
  });

  it("gives no time to a skipped candidate", () => {
    const order = orderOf(4);
    const skipped = [{ commit: sha(2), reason: "the core does not load: made-up error" }];
    const j = joinShards([fakeShard(order, 1, 2, STEPS, skipped), fakeShard(order, 2, 2)], 2);
    expect(j.complete).toBe(false);
    expect(j.skipped).toEqual(skipped);
    expect(j.routers[0]!.rows[2]!.verdict).toBe("not measured");
    expect(bisectText(j).join("\n")).toContain("The job skipped `a000002`: the core does not load: made-up error");
  });

  it("refuses records that do not agree", () => {
    const records = allShards(6, 2);
    expect(() => joinShards([], 2)).toThrow(InputError);
    expect(() => joinShards([records[0]!, records[0]!], 2)).toThrow(InputError);
    expect(() => joinShards(records, 3)).toThrow(InputError);
    expect(() => joinShards([records[0]!, { ...records[1]!, head: "f".repeat(40) }], 2)).toThrow(InputError);
    expect(() => joinShards([records[0]!, { ...records[1]!, order: orderOf(5) }], 2)).toThrow(InputError);
    expect(() => joinShards([records[0]!, { ...records[1]!, commits: [sha(0)] }], 2)).toThrow(InputError);
    expect(() => joinShards([{ ...records[0]!, schema: "other" as typeof SHARD_SCHEMA }], 2)).toThrow(InputError);
    expect(() => joinShards([{ ...records[0]!, report: { ...records[0]!.report!, mode: "process" } }], 2)).toThrow(InputError);
  });
});

describe("the text", () => {
  it("gives the finding, the table of each router and the computer of each job", () => {
    const text = bisectText(joinShards(allShards(9, 3), 3)).join("\n");
    expect(text).toContain("## `sections-tree`");
    expect(text).toContain("The first candidate above the band of the base is `a000004` (feat(core): made-up change 4), with the ratio 2.800.");
    expect(text).toContain("| 5 | `a000004` | feat(core): made-up change 4 | 2 | 2.800 | 0.980 to 1.020 | 100.0 ms | 280.0 ms | slower |");
    expect(text).toContain("- Job 3: 4 x CPU 3, mode `fresh`, 3 candidates, 0 skipped.");
  });

  it("gives the table of one job, and keeps a | of a subject out of the cells", () => {
    const order = orderOf(2).map((c, i) => (i === 0 ? { ...c, subject: "a | b" } : c));
    const text = shardText(fakeShard(order, 1, 1)).join("\n");
    expect(text).toContain("The A/A ratios of the rounds: 0.980, 1.000, 1.020.");
    expect(text).toContain("| `a000000` | a / b | 1.000 | 100.0 ms |");
  });
});
