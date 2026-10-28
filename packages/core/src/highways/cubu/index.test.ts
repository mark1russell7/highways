import { describe, expect, it } from "vitest";
import { clustered, commonTests, flows, parallel } from "../fixtures.test-util.ts";
import { checkPlan } from "../model.ts";
import { CUBU_DEFAULTS, cubuPlan } from "./index.ts";

describe("the highway strategy cubu (HWY-007)", () => {
  it("gives a correct plan with the kernel fft and without the resampling", () => {
    for (const o of [{ ...CUBU_DEFAULTS, kernel: "fft" as const }, { ...CUBU_DEFAULTS, resample: 0 }]) {
      expect(checkPlan(clustered, cubuPlan({ graph: clustered }, o))).toEqual([]);
    }
  });

  it("gives at least one highway on the parallel edges", () => {
    expect(cubuPlan({ graph: parallel }, CUBU_DEFAULTS).highways.length).toBeGreaterThan(0);
  });

  commonTests("cubu", CUBU_DEFAULTS, cubuPlan, [flows, parallel]);
});
