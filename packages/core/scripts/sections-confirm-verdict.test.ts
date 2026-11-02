import { describe, expect, it } from "vitest";
import { InputError } from "./gates/inputs.ts";
import { aaId, pairedReport, type RawTimes } from "./gates/paired.ts";
import { COMMIT_ARM, PARENT_ARM } from "./gates/pair-confirm.ts";
import {
  CONFIRM_SCHEMA,
  HEAD_REF,
  MAX_PAIRS,
  PAIR_SCHEMA,
  confirmFile,
  confirmText,
  joinConfirm,
  pairOfFile,
  parsePairs,
  type Pair,
  type PairRecord,
} from "./sections-confirm-verdict.ts";

// Made-up records only. No test reads a clock.
/** This function gives a made-up full hash with a unique short hash: `c000001...` for the hash 1. */
const sha = (i: number): string => (0xc000000 + i).toString(16).padEnd(40, "0");
const BASE = "b".repeat(40);
const HEAD = "e".repeat(40);
const ROUTERS = ["sections-tree", "sections"] as const;
/** The A/A factors of the 3 rounds. The spread of each router is p90 of 0.02, 0, 0.02: 0.02. */
const AA = [0.98, 1.0, 1.02];

/** This function gives the made-up record of one pair. The parent takes 100 ms in each round, and the commit takes `level(router)` times that. */
function fakePair(p: Pair, level: (router: string) => number, cpu = `CPU ${p.pair}`): PairRecord {
  const arms = [{ id: PARENT_ARM }, { id: COMMIT_ARM }, { id: aaId(PARENT_ARM) }];
  const inputs = ROUTERS.map((id) => ({ id, group: id }));
  const raw: RawTimes = { ms: new Map(), peak: new Map(inputs.map((x) => [x.id, new Map()])) };
  for (const router of ROUTERS)
    raw.ms.set(
      router,
      new Map([
        [PARENT_ARM, [100, 100, 100]],
        [COMMIT_ARM, [100, 100, 100].map((x) => x * level(router))],
        [aaId(PARENT_ARM), AA.map((f) => 100 * f)],
      ]),
    );
  return {
    schema: PAIR_SCHEMA,
    pair: p.pair,
    head: HEAD,
    base: BASE,
    fixture: "large-clustered",
    routers: [...ROUTERS],
    rounds: 3,
    commit: { ref: p.commit, sha: sha(2 * p.pair), subject: `feat(core): made-up change ${p.pair}` },
    parent: { ref: p.parent, sha: sha(2 * p.pair + 1), subject: "chore: made-up parent" },
    skipped: null,
    env: { cpu, cores: 4, os: "test", arch: "x64", node: "v0", mode: "fresh", context: "test" },
    report: pairedReport("fresh", { cpu, cores: 4, os: "test", arch: "x64", node: "v0" }, "test", arms, inputs, raw),
  };
}

const PLAN = parsePairs(`${sha(2)}:${sha(3)} ${sha(4).slice(0, 7)}:${sha(4).slice(0, 7)}^ ${sha(6)}:`);

describe("the input pairs", () => {
  it("reads the pairs in their order, with spaces, tabs and line ends between them", () => {
    expect(parsePairs(" e55dde1:e55dde1^\tc6af859:82d0270\r\n038f090:c6af859 ")).toEqual([
      { pair: 1, commit: "e55dde1", parent: "e55dde1^" },
      { pair: 2, commit: "c6af859", parent: "82d0270" },
      { pair: 3, commit: "038f090", parent: "c6af859" },
    ]);
  });

  it("gives the parent HEAD to an empty parent and to a token with no colon", () => {
    expect(parsePairs("abc1234: def5678 x:HEAD").map((p) => p.parent)).toEqual([HEAD_REF, HEAD_REF, HEAD_REF]);
    expect(parsePairs("main~3:v1.2.0").map((p) => [p.commit, p.parent])).toEqual([["main~3", "v1.2.0"]]);
  });

  it("refuses an empty input, too many pairs, bad refs, a repeated pair and a commit against itself", () => {
    for (const bad of ["", "   ", "a:b:c", ":abc", "a$(x):b", "-x:b", "a;b:c", "abc:abc", "HEAD", "a:b a:b"]) expect(() => parsePairs(bad), bad).toThrow(RangeError);
    const many = Array.from({ length: MAX_PAIRS + 1 }, (_, i) => `c${i}:p${i}`).join(" ");
    expect(() => parsePairs(many)).toThrow(RangeError);
    expect(parsePairs(many.split(" ").slice(0, MAX_PAIRS).join(" "))).toHaveLength(MAX_PAIRS);
  });

  it("names the record file of a pair, and reads the pair from a path", () => {
    expect(confirmFile(3)).toBe("confirm-pair3.json");
    expect(pairOfFile("sections-confirm-pair3/confirm-pair3.json")).toBe(3);
    expect(pairOfFile("x\\confirm-pair12.json")).toBe(12);
    expect(pairOfFile("confirm-pair0.json")).toBeUndefined();
    expect(pairOfFile("bisect-shard3.json")).toBeUndefined();
  });
});

describe("the join of the pairs", () => {
  it("gives one row for each pair and router, with the ratio and the band of its own job", () => {
    const levels = [(r: string) => (r === "sections-tree" ? 5.3 : 2.8), () => 0.6, () => 1.01];
    const j = joinConfirm(PLAN.map((p, i) => fakePair(p, levels[i]!)), PLAN);
    expect(j.schema).toBe(CONFIRM_SCHEMA);
    expect(j.complete).toBe(true);
    expect(j.missing).toEqual([]);
    expect(j.rows.map((r) => [r.pair, r.router, r.verdict])).toEqual([
      [1, "sections-tree", "slower"],
      [1, "sections", "slower"],
      [2, "sections-tree", "faster"],
      [2, "sections", "faster"],
      [3, "sections-tree", "inside"],
      [3, "sections", "inside"],
    ]);
    const first = j.rows[0]!;
    expect(first.ratio).toBeCloseTo(5.3, 10);
    expect(first.aaCount).toBe(3);
    expect(first.spread).toBeCloseTo(0.02, 10);
    expect(first.band!.lo).toBeCloseTo(0.98, 10);
    expect(first.cpu).toBe("CPU 1");
    expect(j.rows[4]!.parentRef).toBe(HEAD_REF);
  });

  it("marks a pair with no record and a skipped pair as not measured", () => {
    const skipped = { ...fakePair(PLAN[1]!, () => 1), skipped: "c000004^: the core does not load: made-up error", report: null };
    const j = joinConfirm([fakePair(PLAN[0]!, () => 2), skipped], PLAN);
    expect(j.complete).toBe(false);
    expect(j.missing).toEqual([3]);
    expect(j.skipped).toEqual([{ pair: 2, reason: "c000004^: the core does not load: made-up error" }]);
    expect(j.rows.filter((r) => r.verdict === "not measured").map((r) => r.pair)).toEqual([2, 2, 3, 3]);
    const text = confirmText(j).join("\n");
    expect(text).toContain("**The record is not complete.**");
    expect(text).toContain("The pair 3 has no record.");
    expect(text).toContain("- The job of the pair 2 timed no arm: c000004^: the core does not load: made-up error");
  });

  it("refuses records that do not agree with the plan or with each other", () => {
    const a = fakePair(PLAN[0]!, () => 2);
    const b = fakePair(PLAN[1]!, () => 2);
    expect(() => joinConfirm([], PLAN)).toThrow(InputError);
    expect(() => joinConfirm([a, a], PLAN)).toThrow(InputError);
    expect(() => joinConfirm([{ ...a, pair: 9 }], PLAN)).toThrow(InputError);
    expect(() => joinConfirm([{ ...a, commit: { ...a.commit, ref: "other" } }], PLAN)).toThrow(InputError);
    expect(() => joinConfirm([a, { ...b, head: "f".repeat(40) }], PLAN)).toThrow(InputError);
    expect(() => joinConfirm([a, { ...b, rounds: 10 }], PLAN)).toThrow(InputError);
    expect(() => joinConfirm([{ ...a, schema: "other" as typeof PAIR_SCHEMA }], PLAN)).toThrow(InputError);
    expect(() => joinConfirm([{ ...a, report: { ...a.report!, mode: "process" } }], PLAN)).toThrow(InputError);
    expect(() => joinConfirm([{ ...a, report: { ...a.report!, base: "base" } }], PLAN)).toThrow(InputError);
  });
});

describe("the text of the confirm", () => {
  it("gives the plan and a row for each pair and router, with the ref of the input when it is not the hash", () => {
    const text = confirmText(joinConfirm(PLAN.map((p) => fakePair(p, () => 2.8)), PLAN)).join("\n");
    expect(text).toContain("Each arm has 3 rounds");
    expect(text).toContain("the fixture `large-clustered` of `fa1dd82~1` (`bbbbbbb`)");
    expect(text).toContain("| 1 | `sections-tree` | `c000002` | `c000003` | feat(core): made-up change 1 | 2.800 | 0.980 to 1.020 | 100.0 ms | 280.0 ms | slower | CPU 1 |");
    expect(text).toContain("| 2 | `sections` | `c000004` | `c000005` (`c000004^`) |");
    expect(text).toContain("| 3 | `sections` | `c000006` | `c000007` (`HEAD`) |");
  });
});
