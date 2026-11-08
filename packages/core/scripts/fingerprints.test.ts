import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENTRY_FINGERPRINTS, FINGERPRINT_SOURCE, fingerprintProbes, type EntryRead } from "../src/index.ts";
import { probeSource, tableText } from "./fingerprints.ts";

describe("the table of the fingerprints", () => {
  it("names the probes of fingerprintProbes", () => {
    expect(probeSource(fingerprintProbes())).toBe(FINGERPRINT_SOURCE);
  });

  it("is the text that tableText writes for its rows", () => {
    const reads: EntryRead[] = Object.entries(ENTRY_FINGERPRINTS).map(([key, fingerprint]) => ({ key, hashes: {}, refused: {}, fingerprint }));
    const file = readFileSync(new URL("../src/fingerprint/table.ts", import.meta.url), "utf8").replace(/\r\n/gu, "\n");
    expect(file).toBe(tableText([...reads].reverse(), FINGERPRINT_SOURCE));
  });
});
