import { RESPONSE_RECORDS_SCHEMA, type ResponseData, type ResponseDimension, type ResponsePoint } from "@mark1russell7/rigor-statistics";
import { describe, expect, it } from "vitest";
import { random } from "@mark1russell7/rigor-generators";
import { fitSweep } from "./sweep-fit.ts";

/** Made-up data with `k` continuous dimensions, each seen at each of `n` points, and one measure. */
function data(k: number, n: number): ResponseData {
  const rng = random(7);
  const dims: ResponseDimension[] = Array.from({ length: k }, (_, i) => ({ id: `d${i}`, label: `d${i}`, unit: "", kind: "continuous", range: [0, 1] }));
  const points: ResponsePoint[] = Array.from({ length: n }, (_, p) => {
    const values: Record<string, number> = {};
    for (const d of dims) values[d.id] = rng.next();
    return { id: `p${p}`, values, measures: { y: values["d0"]! + 0.1 * rng.next() }, group: `g${p % 6}` };
  });
  return { schema: RESPONSE_RECORDS_SCHEMA, name: "made-up", dimensions: dims, measures: [{ id: "y", label: "y", unit: "", direction: "lower" }], points };
}

describe("the fit of a sweep record (SPACE-INPUTS)", () => {
  it("keeps the interactions seen when the expansion is under the limit", () => {
    const fit = fitSweep(data(4, 30));
    expect(fit.interactions).toBe("seen");
    expect(fit.record.models).toHaveLength(1);
  });

  it("fits without interactions when the expansion seen passes the limit", () => {
    // 46 dimensions give 92 terms of one dimension and 1035 products of two, so the expansion seen passes 1023.
    const fit = fitSweep(data(46, 30));
    expect(fit.interactions).toBe(false);
    expect(fit.record.models).toHaveLength(1);
  });
});
