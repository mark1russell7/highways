import { readFileSync } from "node:fs";
import { checkSplit, declaredClaimOf, familyOf } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { HIGHWAYS_FAMILIES } from "../../families/index.ts";
import { documentHash } from "./hash.ts";
import { formatInput, type LayoutInput } from "./forms.ts";
import {
  checkFamilies,
  familyCell,
  manifestHash,
  SCREEN_FAMILY_BY,
  SCREEN_SETS,
  SCREEN_V2,
  SCREEN_V3,
  screenInputs,
  screenSplit,
  setManifest,
  signTestPower,
  splitPath,
  type LayoutCorpus,
} from "./set.ts";

const v2 = screenInputs(SCREEN_V2);
const v3 = screenInputs(SCREEN_V3);
const root = new URL("../../../../../corpus/", import.meta.url);
const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), "utf8"));

describe("the screen set screen-v3 (CORPUS-FAMILIES)", () => {
  it("has the 15 families of HIGHWAYS_FAMILIES, each with the 10 seeds 0 to 9", () => {
    expect(SCREEN_SETS["screen-v3"]).toBe(SCREEN_V3);
    expect(SCREEN_V3.families.map((f) => f.name)).toEqual(HIGHWAYS_FAMILIES.map((f) => f.name));
    expect(v3).toHaveLength(150);
    expect(v3.map((i) => i.id)).toEqual(SCREEN_V3.families.flatMap((f) => Array.from({ length: 10 }, (_, k) => `screen-v3/${f.name}/s${k}`)));
    for (const i of v3) expect(i.hash).toBe(documentHash(i));
    expect(new Set(v3.map((i) => JSON.stringify([i.boxes, i.edges]))).size).toBe(150);
  });

  it("gives the boards of screen-v2 for its 6 families: the same boxes, edges, generator and cell", () => {
    for (const old of v2) {
      const input = v3.find((i) => i.id === `screen-v3/${old.family}/s${old.seed}`)!;
      expect({ boxes: input.boxes, edges: input.edges, generator: input.generator, cell: input.cell }, old.id).toEqual({
        boxes: old.boxes,
        edges: old.edges,
        generator: old.generator,
        cell: old.cell,
      });
    }
    expect(manifestHash(setManifest(SCREEN_V2, v2))).toBe("35795acefa7148c3");
  });

  it("matches the files in corpus/screen-v3 and its split file", () => {
    for (const input of v3) {
      const file = readJson(`screen-v3/${input.family}/s${input.seed}.json`) as LayoutInput;
      expect(file, input.id).toEqual(input);
      expect(JSON.parse(formatInput(input))).toEqual(input);
    }
    const manifest = readJson("screen-v3/corpus.json") as LayoutCorpus;
    expect(manifest).toEqual(setManifest(SCREEN_V3, v3));
    expect(manifestHash(manifest)).toBe("f9fc4d8823ded6e5");
    const split = screenSplit(SCREEN_V3)!;
    expect(splitPath(split)).toBe("splits/screen-v3.f9fc4d8823ded6e5.json");
    expect(readJson(splitPath(split))).toEqual(split);
    expect(checkSplit(split, manifest, "default")).toEqual([]);
    expect(checkSplit(split, manifest, "by-member")).toEqual([]);
  });

  it("passes the claim declared of its manifest, and gives each input the key of its family", () => {
    const manifest = readJson("screen-v3/corpus.json") as LayoutCorpus;
    expect(declaredClaimOf(manifest)).toEqual({ minCount: 10, thin: [], counts: Object.fromEntries(HIGHWAYS_FAMILIES.map((f) => [f.name, 10])), familyBy: { "*": [] }, familyMin: 10 });
    expect(checkFamilies(manifest, v3)).toEqual([]);
    for (const input of v3) expect(familyOf(familyCell(input), SCREEN_FAMILY_BY), input.id).toBe(input.family);
  });
});

describe("the power of the sign test over families", () => {
  it("gives the least count of families on one side that passes at the level 0.05", () => {
    expect(signTestPower(5)).toBeUndefined();
    expect(signTestPower(6)).toBe(6);
    expect(signTestPower(14)).toBe(12);
    expect(signTestPower(15)).toBe(12);
    expect(signTestPower(16)).toBe(13);
    expect(signTestPower(20)).toBe(15);
    expect(signTestPower(15, 0.01)).toBe(13);
  });
});
