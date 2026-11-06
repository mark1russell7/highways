import { readFileSync } from "node:fs";
import { checkSplit, declaredClaimOf, familyOf } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { formatInput, type LayoutInput } from "./forms.ts";
import { documentHash } from "./hash.ts";
import { checkFamilies, familyCell, manifestHash, SCREEN_FAMILY_BY, SCREEN_SETS, SCREEN_V3, SCREEN_V5, SCREEN_V5_KEYS, screenInputs, screenSplit, setManifest, splitPath, type LayoutCorpus } from "./set.ts";

const v3 = screenInputs(SCREEN_V3);
const v5 = screenInputs(SCREEN_V5);
const root = new URL("../../../../../corpus/", import.meta.url);
const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const old = (id: string): LayoutInput => v3.find((i) => i.id === id)!;
const keyOf = (input: LayoutInput): (string | undefined)[] => (input.edges ?? []).map((e) => e.data?.["collection"] as string | undefined);
/** This function gives the edges without the key, so the edges of two arms compare. */
const unkeyed = (input: LayoutInput): unknown[] =>
  (input.edges ?? []).map((e) => {
    const { data, ...plain } = e;
    const { collection: _key, ...rest } = data ?? {};
    return Object.keys(rest).length === 0 ? plain : { ...plain, data: rest };
  });

describe("the screen set screen-v5 (COLLECTION-KEY)", () => {
  it("has the 15 families of screen-v3 under each of the 3 keys, each with the 10 seeds 0 to 9", () => {
    expect(SCREEN_SETS["screen-v5"]).toBe(SCREEN_V5);
    expect(SCREEN_V5_KEYS).toEqual(["none", "random", "cluster"]);
    expect(SCREEN_V5.families.map((f) => f.name)).toEqual(SCREEN_V5_KEYS.flatMap((key) => SCREEN_V3.families.map((f) => `${f.name}.key-${key}`)));
    expect(v5).toHaveLength(450);
    for (const i of v5) expect(i.hash).toBe(documentHash(i));
  });

  it("gives the boards of screen-v3: the same boxes and edges, and only the key changes", () => {
    for (const input of v5) {
      const [family, key] = input.family.split(".key-") as [string, string];
      const base = old(`screen-v3/${family}/s${input.seed}`);
      expect(input.boxes, input.id).toEqual(base.boxes);
      expect(unkeyed(input), input.id).toEqual(unkeyed(base));
      expect(input.cell, input.id).toEqual({ ...base.cell, edgeKey: key });
      const { seed, ...generator } = base.generator!;
      expect(input.generator, input.id).toEqual({ name: "edge-key", version: 1, params: { edgeKey: key, base: generator }, seed });
    }
  });

  it("gives no key on the arm none, and a key on each edge of the arms random and cluster", () => {
    for (const input of v5) {
      const keys = keyOf(input);
      if (input.cell?.edgeKey === "none") expect(keys.every((k) => k === undefined), input.id).toBe(true);
      else expect(keys.every((k) => typeof k === "string" && k.length > 0), input.id).toBe(true);
    }
  });

  it("keeps the key of the arm random on the seed of the member: two calls give the same keys", () => {
    const again = screenInputs(SCREEN_V5);
    expect(again.map(keyOf)).toEqual(v5.map(keyOf));
  });

  it("matches the files in corpus/screen-v5 and its split file, and keeps the hashes of the other sets", () => {
    for (const input of v5) {
      const file = readJson(`screen-v5/${input.family}/s${input.seed}.json`) as LayoutInput;
      expect(file, input.id).toEqual(input);
      expect(JSON.parse(formatInput(input))).toEqual(input);
    }
    const manifest = readJson("screen-v5/corpus.json") as LayoutCorpus;
    expect(manifest).toEqual(setManifest(SCREEN_V5, v5));
    expect(manifestHash(manifest)).toBe("82066dd4b30c5449");
    const split = screenSplit(SCREEN_V5)!;
    expect(splitPath(split)).toBe("splits/screen-v5.82066dd4b30c5449.json");
    expect(readJson(splitPath(split))).toEqual(split);
    expect(checkSplit(split, manifest, "default")).toEqual([]);
    expect(checkSplit(split, manifest, "by-member")).toEqual([]);
    expect(manifestHash(setManifest(SCREEN_V3, v3))).toBe("f9fc4d8823ded6e5");
  });

  it("passes the claim declared of its manifest, and gives each input the key of its family", () => {
    const manifest = readJson("screen-v5/corpus.json") as LayoutCorpus;
    expect(declaredClaimOf(manifest)).toMatchObject({ minCount: 10, familyMin: 10 });
    expect(checkFamilies(manifest, v5)).toEqual([]);
    for (const input of v5) expect(familyOf(familyCell(input), SCREEN_FAMILY_BY), input.id).toBe(input.family);
  });
});
