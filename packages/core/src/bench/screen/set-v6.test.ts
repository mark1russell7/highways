import { readFileSync } from "node:fs";
import { checkSplit, declaredClaimOf, familyOf } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { cornersRouter } from "../../routers/corners.ts";
import { formatInput, type LayoutInput } from "./forms.ts";
import { documentHash } from "./hash.ts";
import { checkFamilies, familyCell, manifestHash, SCREEN_FAMILY_BY, SCREEN_SETS, SCREEN_V3, SCREEN_V6, SCREEN_V6_INNER, screenInputs, screenSplit, setManifest, splitPath, type LayoutCorpus } from "./set.ts";

const v6 = screenInputs(SCREEN_V6);
const v3 = screenInputs(SCREEN_V3);
const root = new URL("../../../../../corpus/", import.meta.url);
const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), "utf8"));

describe("the screen set screen-v6 (SCREEN-INNER)", () => {
  it("has frame-rows at inner 4 and at inner 12, each with the 10 seeds 0 to 9", () => {
    expect(SCREEN_SETS["screen-v6"]).toBe(SCREEN_V6);
    expect(SCREEN_V6_INNER).toEqual([4, 12]);
    expect(SCREEN_V6.families.map((f) => f.name)).toEqual(["frame-rows.inner-4", "frame-rows.inner-12"]);
    expect(v6).toHaveLength(20);
    for (const i of v6) expect(i.hash).toBe(documentHash(i));
  });

  it("gives the boxes of frame-rows in screen-v3, with the generator of frame-rows and its parameter inner", () => {
    for (const input of v6) {
      const inner = Number(input.family.split(".inner-")[1]);
      const base = v3.find((i) => i.id === `screen-v3/frame-rows/s${input.seed}`)!;
      expect(input.boxes, input.id).toEqual(base.boxes);
      expect(input.cell, input.id).toEqual(base.cell);
      expect(input.generator, input.id).toEqual({ ...base.generator!, params: { inner } });
      expect((input.edges ?? []).length, input.id).toBeGreaterThan((base.edges ?? []).length);
    }
  });

  it("gives inner routes on each board: corners routes at least 30 edges inside a frame", () => {
    const corners = cornersRouter({ name: "corners" });
    for (const f of SCREEN_V6.families) {
      for (let k = 0; k < f.seeds; k++) {
        const inner = corners.route(f.make(k)).routes.filter((r) => r.frame !== undefined).length;
        expect(inner, `${f.name} s${k}`).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it("matches the files in corpus/screen-v6 and its split file, and keeps the hashes of the other sets", () => {
    for (const input of v6) {
      const file = readJson(`screen-v6/${input.family}/s${input.seed}.json`) as LayoutInput;
      expect(file, input.id).toEqual(input);
      expect(JSON.parse(formatInput(input))).toEqual(input);
    }
    const manifest = readJson("screen-v6/corpus.json") as LayoutCorpus;
    expect(manifest).toEqual(setManifest(SCREEN_V6, v6));
    expect(manifestHash(manifest)).toBe("742626a676f29f5e");
    const split = screenSplit(SCREEN_V6)!;
    expect(splitPath(split)).toBe("splits/screen-v6.742626a676f29f5e.json");
    expect(readJson(splitPath(split))).toEqual(split);
    expect(checkSplit(split, manifest, "default")).toEqual([]);
    expect(checkSplit(split, manifest, "by-member")).toEqual([]);
    for (const id of ["screen-v1", "screen-v2", "screen-v3", "screen-v4", "screen-v5"]) {
      const set = SCREEN_SETS[id]!;
      expect(manifestHash(setManifest(set)), id).toBe(manifestHash(readJson(`${id}/corpus.json`) as LayoutCorpus));
    }
  });

  it("passes the claim declared of its manifest, and gives each input the key of its family", () => {
    const manifest = readJson("screen-v6/corpus.json") as LayoutCorpus;
    expect(declaredClaimOf(manifest)).toMatchObject({ minCount: 10, familyMin: 10 });
    expect(checkFamilies(manifest, v6)).toEqual([]);
    for (const input of v6) expect(familyOf(familyCell(input), SCREEN_FAMILY_BY), input.id).toBe(input.family);
  });
});
