import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  freshJobs,
  orderOf,
  orderSlice,
  pairsOf,
  readPair,
  rotatedOrder,
  SCHEMA,
  SENTINELS,
  sentinelReads,
  sentinelVerdict,
  type OrderJob,
  type SentinelReference,
} from "./arm-order-rows.ts";

const record = JSON.parse(
  readFileSync(
    new URL("./data/arm-order/record.json", import.meta.url),
    "utf8",
  ),
);

/** This function makes a job where the arm `base` costs `penalty` more when it goes after `other`. */
function jobWith(penalty: number): OrderJob {
  const arms = ["a", "b", "c"];
  const rounds = Array.from({ length: 30 }, (_, round) => round);
  const ms = (arm: string, other: string) =>
    rounds.map((round) => {
      const order = rotatedOrder(arms, round);
      return order.indexOf(arm) > order.indexOf(other)
        ? 10 * Math.exp(penalty)
        : 10;
    });
  return {
    schema: "paired-time/1",
    mode: "fresh",
    arms,
    inputs: [
      {
        id: "one",
        group: "g",
        ms: { a: ms("a", "c"), b: ms("b", "a"), c: ms("c", "a") },
      },
    ],
  };
}

describe("the read of the arm order", () => {
  it("gives one arm of a pair the first place in 2 of 3 rounds", () => {
    const first = [0, 1, 2].map((round) =>
      rotatedOrder(["a", "b", "c"], round),
    );
    expect(first).toEqual([
      ["a", "b", "c"],
      ["b", "c", "a"],
      ["c", "a", "b"],
    ]);
    expect(
      first.filter((order) => order.indexOf("a") < order.indexOf("c")),
    ).toHaveLength(1);
  });

  it("finds an injected order effect, and reads 0 on a copy with no effect", () => {
    expect(readPair([jobWith(0)], "a", "c", 5).whole.difference).toBe(0);
    expect(readPair([jobWith(0.1)], "a", "c", 5).whole.difference).toBeCloseTo(
      0.2,
      10,
    );
  });

  it("takes the order of a job from its field, and the rotated order when the field is absent", () => {
    const job = jobWith(0);
    expect(orderOf(job, 1)).toEqual(["b", "c", "a"]);
    const stated: OrderJob = { ...job, order: "mirrored" };
    expect(orderOf(stated, 1)).toEqual(["c", "b", "a"]);
    const rounds = Array.from({ length: 10 }, (_, round) => orderOf(stated, round));
    expect(rounds.filter((order) => order.indexOf("a") < order.indexOf("c"))).toHaveLength(5);
  });

  it("keeps only the jobs of mode fresh with the arms of the first job", () => {
    const job = jobWith(0);
    expect(
      freshJobs([
        job,
        { ...job, mode: "process" },
        { ...job, arms: ["a", "c"] },
      ]),
    ).toEqual([job]);
    expect(pairsOf(job.arms)).toEqual([
      ["a", "c"],
      ["a", "b"],
    ]);
  });

  it("repeats the read of the record on its slice", () => {
    expect(record.schema).toBe(SCHEMA);
    expect(orderSlice(record.slice.jobs)).toEqual(record.slice);
  });

  it("holds the figures of the page: no limit moves, and one group is over its shuffle", () => {
    const [copy] = record.pairs;
    expect(copy.other).toBe("old~aa");
    expect(Math.abs(copy.whole.bias)).toBeLessThan(0.001);
    for (const pair of record.pairs)
      expect(Math.abs(pair.largest.bias)).toBeLessThan(Math.log(1.05));
    const over = record.pairs.flatMap(
      (pair: {
        other: string;
        groups: {
          group: string;
          difference: number;
          shuffleDifference: { q95: number };
        }[];
      }) =>
        pair.groups
          .filter(
            (group) => Math.abs(group.difference) > group.shuffleDifference.q95,
          )
          .map((group) => `${pair.other} ${group.group}`),
    );
    expect(over).toEqual(["old~aa router n41-64"]);
  });
});

describe("the sentinel check", () => {
  const CPU = "a model";
  const reference: readonly SentinelReference[] = [{ cpu: CPU, medians: Object.fromEntries(SENTINELS.map((id, at) => [id, 100 + 10 * at])) }];
  /** This function makes a job on a model, with a factor on the old arm of each sentinel. */
  const job = (factor: (id: string) => number, cpu = CPU, aa = 1): OrderJob => ({
    schema: "paired-time/1",
    mode: "fresh",
    arms: ["old", "workspace", "old~aa"],
    env: { cpu },
    inputs: SENTINELS.map((id) => {
      const ms = Array.from({ length: 5 }, () => reference[0]!.medians[id]! * factor(id));
      return { id, group: "sentinel", ms: { old: ms, workspace: ms, "old~aa": ms.map((m) => m * aa) } };
    }),
  });
  const holds = (j: OrderJob): boolean | null => sentinelReads(reference, [j])[0]!.holds;

  it("passes a job with no fault", () => {
    const read = sentinelReads(reference, [job(() => 1)])[0]!;
    expect(read).toMatchObject({ holds: true, aa: 0 });
    expect(read.level).toBeCloseTo(0, 12);
    expect(read.shape).toBeCloseTo(0, 12);
  });

  it("passes an even factor of 1.28 on all the sentinels, and prints its level", () => {
    const read = sentinelReads(reference, [job(() => 1.28)])[0]!;
    expect(read.holds).toBe(true);
    expect(read.level).toBeCloseTo(Math.log(1.28), 12);
  });

  it("fails a factor of 1.2 on one sentinel, and passes 1.1 on the same sentinel", () => {
    expect(holds(job((id) => (id === SENTINELS[2] ? 1.2 : 1)))).toBe(false);
    expect(holds(job((id) => (id === SENTINELS[2] ? 1.1 : 1)))).toBe(true);
  });

  it("fails an A/A pair over its limit", () => {
    expect(holds(job(() => 1, CPU, 1.2))).toBe(false);
    expect(holds(job(() => 1, CPU, 1.1))).toBe(true);
  });

  it("does not count a job on a model outside the reference, and reads no-read under 3 jobs", () => {
    const outside = job(() => 1, "another model");
    expect(holds(outside)).toBeNull();
    expect(sentinelReads(reference, [outside])[0]).toMatchObject({ note: "no read", referenceJobs: 0 });
    const fine = job(() => 1);
    const verdict = (...jobs: OrderJob[]) => sentinelVerdict(sentinelReads(reference, jobs));
    expect(verdict(fine, fine, fine, outside, outside)).toMatchObject({ verdict: "holds", noRead: 2 });
    const thin = verdict(fine, fine, outside, outside, outside);
    expect(thin).toMatchObject({ verdict: "fails", noRead: 3 });
    expect(thin.reason).toBe("3 of 5 jobs have no read, because the reference has no job on their model.");
    expect(verdict(fine, fine, fine, job(() => 1, CPU, 1.2)).verdict).toBe("fails");
  });

  it("marks a reference of one job, and fails the fault of 1.2 on it", () => {
    const two = [...reference, ...reference];
    const clean = sentinelReads(two, [job(() => 1)])[0]!;
    expect(clean.referenceJobs).toBe(2);
    expect(clean.note).toBeUndefined();
    const one = sentinelReads(reference, [job(() => 1)]);
    expect(one[0]).toMatchObject({ note: "reference: one job", referenceJobs: 1, holds: true });
    expect(sentinelVerdict(one)).toMatchObject({ oneJobReference: 1 });
    expect(sentinelReads(reference, [job((id) => (id === SENTINELS[0] ? 1.2 : 1))])[0]).toMatchObject({ note: "reference: one job", holds: false });
  });

  it("states what the check gives up", () => {
    expect(sentinelVerdict(sentinelReads(reference, [job(() => 1.28)])).limit).toBe("An even slowdown passes, so no compare of ms across runs rests on this check.");
  });

  it("names each sentinel in the committed reference, for each job of the before run", () => {
    const committed = JSON.parse(readFileSync(new URL("./data/arm-order/sentinel-reference.json", import.meta.url), "utf8")) as { readonly jobs: readonly SentinelReference[] };
    expect(committed.jobs).toHaveLength(5);
    for (const r of committed.jobs) expect(Object.keys(r.medians).sort()).toEqual([...SENTINELS].sort());
  });
});
