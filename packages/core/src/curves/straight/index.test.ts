import { describe, expect, it } from "vitest";
import { sampleCurve } from "../sample.ts";
import { straightCurve } from "./index.ts";

describe("straightCurve", () => {
  it("gives the polyline as it is", () => {
    const p = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const c = straightCurve(p);
    expect(c.map((s) => s.kind)).toEqual(["move", "line", "line"]);
    expect(sampleCurve(c)).toEqual(p);
    expect(straightCurve([])).toEqual([]);
  });
});
