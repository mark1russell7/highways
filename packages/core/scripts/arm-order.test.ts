import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  freshJobs,
  orderSlice,
  pairsOf,
  readPair,
  rotatedOrder,
  SCHEMA,
  type OrderJob,
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
