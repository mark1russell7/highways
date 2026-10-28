import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildIndex, checkIdeas, FAMILIES, indexText, INDEX_URL, loadIdeas, loadMeas3, loadSchema, validate, type Idea } from "../../../scripts/ideas.ts";

const ideas = loadIdeas();
const schema = loadSchema();
const meas3 = loadMeas3();

describe("the idea catalog (IDEA0)", () => {
  it("reads the five family files", () => {
    expect(FAMILIES.length).toBe(5);
    expect(ideas.length).toBeGreaterThanOrEqual(273);
  });

  it("has records that agree with the schema, unique ids, links to ids that exist and known measures", () => {
    expect(checkIdeas(ideas, schema, meas3)).toEqual([]);
  });

  it("has an index that is current", () => {
    const old = readFileSync(INDEX_URL, "utf8").replace(/\r\n/g, "\n");
    expect(old === indexText(buildIndex(ideas, meas3)), "index.json is old. Run `pnpm ideas`.").toBe(true);
  });

  it("finds the faults that it must find", () => {
    // The copy has no result, so the stage "dropped" is a fault.
    const base = Object.fromEntries(Object.entries(ideas.find((r) => r.id === "HWY-001")!).filter(([k]) => k !== "result")) as Idea;
    const bad: Idea[] = [
      { ...base, id: "HWY-999", stage: "dropped", related: ["HWY-998"], wins: ["Q7"], screen: "B99 falls" },
      { ...base, id: "HWY-999", kind: "guess" },
    ];
    const faults = checkIdeas([...ideas, ...bad], schema, meas3).join("\n");
    expect(faults).toContain('HWY-999: $: the field "result" is missing');
    expect(faults).toContain("HWY-999: the id is not unique");
    expect(faults).toContain("related holds HWY-998, which does not exist");
    expect(faults).toContain("the measure Q7 is not in MEASURES or in MEAS3");
    expect(faults).toContain("the measure B99 is not in MEASURES or in MEAS3");
    expect(faults).toContain('"guess" is not one of');
    expect(validate(schema, { ...base, extra: 1 })).toEqual(['$: the field "extra" is not in the schema']);
  });
});
