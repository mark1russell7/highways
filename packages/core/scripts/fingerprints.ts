// The fingerprints of the keyed routers (ENTRY-FINGERPRINT): `node scripts/fingerprints.ts [--write] [--out <dir>] [--entries <key>,<key>]`.
// The script reads each entry of `routerEntries` over `fingerprintProbes`. Without --write, it compares the reads with `src/fingerprint/table.ts`
// and fails on a difference. With --write, it writes the table. With --out, it writes the table of the read, the hash of each probe and the times.
// The table does not hold a time, so the same commit gives the same table. The job `fingerprints` of `ci.yml` and the cells of `Xplat` start the check.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { BAND_PROBES, emptyBands, ENTRY_FINGERPRINTS, FINGERPRINT_SOURCE, fingerprintFindings, fingerprintProbes, HIGHWAYS_FAMILIES, PROBE_SEED, readEntry, routerEntries, type EntryRead, type FingerprintProbe } from "../src/index.ts";

/** This function gives the text of the source of the probes, for the table. */
export function probeSource(probes: readonly FingerprintProbe[]): string {
  const bands = BAND_PROBES.length === 0 ? "" : ` and ${BAND_PROBES.length} boards of size bands`;
  return `${HIGHWAYS_FAMILIES.length} corpus families at their defaults${bands}, seed ${PROBE_SEED}: ${probes.length} probes`;
}

/** This function gives the text of the file `src/fingerprint/table.ts`. The entries are in the order of their keys. */
export function tableText(reads: readonly EntryRead[], source: string): string {
  const rows = [...reads].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map((r) => `  ${JSON.stringify(r.key)}: ${JSON.stringify(r.fingerprint)},\n`);
  return `// This file is generated. Do not edit it. \`node scripts/fingerprints.ts --write\` writes it, and the check of the same script compares it.
// Each value is \`fingerprintOf\` of \`@mark1russell7/layout-contract\` over the probe hashes of one keyed router, with its default options.

/** The probes of the table. */
export const FINGERPRINT_SOURCE = ${JSON.stringify(source)};

/** The fingerprint of each keyed router, by its key. */
export const ENTRY_FINGERPRINTS: Readonly<Record<string, string>> = Object.freeze({
${rows.join("")}});
`;
}

/** This function starts the script and gives its exit code. */
function main(args: readonly string[]): number {
  const option = (name: string): string | undefined => {
    const at = args.indexOf(name);
    return at === -1 ? undefined : args[at + 1];
  };
  const only = option("--entries")?.split(",");
  const write = args.includes("--write");
  if (write && only !== undefined) throw new RangeError("The option --write needs each entry.");
  const start = performance.now();
  const probes = fingerprintProbes();
  const empty = emptyBands(probes);
  if (empty.length > 0) throw new RangeError(`The probes cover no board of the size bands ${empty.join(", ")}.`);
  const entries = routerEntries().filter((e) => only === undefined || only.includes(e.key));
  const times: Record<string, number> = {};
  const reads = entries.map((entry) => {
    const t0 = performance.now();
    const read = readEntry(entry, probes);
    times[entry.key] = Math.round(performance.now() - t0);
    return read;
  });
  const seconds = (performance.now() - start) / 1000;
  const source = probeSource(probes);
  const text = tableText(reads, source);
  const out = option("--out");
  if (out !== undefined) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "table.ts"), text);
    writeFileSync(join(out, "probe-hashes.json"), `${JSON.stringify(Object.fromEntries(reads.map((r) => [r.key, { hashes: r.hashes, refused: r.refused }])), null, 2)}\n`);
    const meta = { node: process.version, platform: process.platform, arch: process.arch, entries: reads.length, probes: probes.length, seconds: Number(seconds.toFixed(1)), ms: times };
    writeFileSync(join(out, "times.json"), `${JSON.stringify(meta, null, 2)}\n`);
  }
  const findings = fingerprintFindings(write ? {} : ENTRY_FINGERPRINTS, reads, !write && only === undefined).filter((f) => !write || f.includes("refuses each"));
  if (!write && source !== FINGERPRINT_SOURCE) findings.push(`The probes changed from "${FINGERPRINT_SOURCE}" to "${source}".`);
  for (const finding of findings) process.stdout.write(`${finding}\n`);
  const refused = reads.reduce((sum, r) => sum + Object.keys(r.refused).length, 0);
  process.stdout.write(`${findings.length} findings over ${reads.length} entries and ${probes.length} probes, ${refused} refused probes, ${seconds.toFixed(1)} s.\n`);
  if (write && findings.length === 0) writeFileSync(new URL("../src/fingerprint/table.ts", import.meta.url), text);
  return findings.length === 0 ? 0 : 1;
}

if (process.argv[1]?.endsWith("fingerprints.ts") === true) process.exitCode = main(process.argv.slice(2));
