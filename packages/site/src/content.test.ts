import { describe, expect, it } from "vitest";
import { ROUTERS } from "@highways/core";
import { firstTable, README, routerMethods, sectionOf } from "./content.ts";

const md = ["# T", "", "## A", "text a", "", "## B", "| x | y |", "|---|---|", "| `one` | first |", "", "after", "# C"].join("\n");

describe("content", () => {
  it("finds a section by its heading", () => {
    expect(sectionOf(md, "A")).toBe("text a");
    expect(sectionOf(md, "Z")).toBe("");
  });

  it("keeps the first table of a section", () => {
    expect(firstTable(sectionOf(md, "B"))).toBe("| x | y |\n|---|---|\n| `one` | first |");
  });

  it("reads the method of each router", () => {
    expect(routerMethods(md).get("one")).toBe("first");
  });

  it("gives a method from the README for each router of the core", () => {
    for (const r of ROUTERS) expect(README.methods.get(r.name), r.name).toBeTruthy();
    expect(README.idea).toContain("highway");
  });
});
