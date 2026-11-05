import { describe, expect, it } from "vitest";
import { MAP_VIEWS, mapViewFile, reportLine, shotPlan } from "./shots.ts";

describe("the plan of the shots", () => {
  it("gives two widths and two color schemes for each page", () => {
    const plan = shotPlan("compare.html, results.html");
    expect(plan).toHaveLength(8);
    expect(plan.map((shot) => shot.file).slice(0, 4)).toEqual(["compare-1280-light.png", "compare-1280-dark.png", "compare-390-light.png", "compare-390-dark.png"]);
    expect(new Set(plan.map((shot) => shot.file)).size).toBe(8);
  });

  it("gives the phone view only at the width 390", () => {
    for (const shot of shotPlan("compare.html")) {
      expect(shot.phone).toBe(shot.width === 390);
      expect(shot.height).toBe(shot.phone ? 844 : 900);
    }
  });

  it("skips an empty name, and keeps the name of a page with a query", () => {
    expect(shotPlan(" , ")).toEqual([]);
    expect(shotPlan("compare.html?board=grid,")[0]?.file).toBe("compare-1280-light.png");
  });
});

describe("the views of the map", () => {
  const views = MAP_VIEWS["examples.html"]!;

  it("gives a file for each view of a shot in the light scheme, and each file once", () => {
    const files = shotPlan("examples.html").flatMap((shot) => views.map((view) => mapViewFile(shot, view)));
    const light = files.filter((file) => file !== undefined);
    expect(light).toHaveLength(2 * views.length);
    expect(new Set(light).size).toBe(light.length);
    expect(light[0]).toBe("examples-1280-light-closed-near.png");
  });

  it("gives no view in the dark scheme", () => {
    const dark = shotPlan("examples.html").find((shot) => shot.colorScheme === "dark")!;
    expect(mapViewFile(dark, views[0]!)).toBeUndefined();
  });
});

describe("the report of a shot", () => {
  const shot = shotPlan("compare.html")[2]!;

  it("states a page that fits its view", () => {
    expect(reportLine(shot, { view: 390, scroll: 390, errors: [] })).toBe("compare-390-light.png viewport 390 scrollWidth 390 ok errors 0");
  });

  it("states a page that is wider than its view, and each error", () => {
    expect(reportLine(shot, { view: 390, scroll: 412, errors: ["a", "b"] })).toBe("compare-390-light.png viewport 390 scrollWidth 412 OVERFLOW errors 2 a | b");
  });
});
