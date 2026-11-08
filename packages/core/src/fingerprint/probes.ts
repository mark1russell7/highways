// The probe inputs of the fingerprints (ENTRY-FINGERPRINT): one board of each corpus family at its defaults. The defaults cover each size band.
// A board of `BAND_PROBES` fills a band that a change of the families leaves empty. A change of the output of an entry on one family changes the hash of that probe, and thus its fingerprint.
import type { DimensionValues } from "@mark1russell7/layout-contract";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../families/index.ts";
import type { Graph } from "../model.ts";
import { PORTFOLIO_BANDS, portfolioBand } from "../portfolio/bands.ts";

/** The seed of the board of each probe. */
export const PROBE_SEED = 1;

/** One probe of the fingerprints: a board of one corpus family. */
export interface FingerprintProbe {
  /** The id: `<family>@<version>` for the defaults, and `<family>@<version>/<dimension>=<value>` for a board of a size band. */
  readonly id: string;
  readonly family: string;
  /** The count of the nodes of the board. */
  readonly nodes: number;
  /** The id of the size band of the board, from `portfolioBand`. */
  readonly band: string;
  readonly graph: Graph;
}

/** One board of a size band that the defaults of the families leave empty. It names a family and the dimensions that differ from the defaults. */
export interface BandProbe {
  readonly family: string;
  readonly dims: DimensionValues;
}

/**
 * The boards of the size bands that no family gives at its defaults. The defaults of the 28 families cover each band, so the list is empty.
 * When a change of a family leaves a band empty, `emptyBands` names it, and a board goes into this list.
 */
export const BAND_PROBES: readonly BandProbe[] = Object.freeze([]);

/**
 * This function gives the probes of the fingerprints, in the order of `HIGHWAYS_FAMILIES`: each family at its defaults, then each board of `BAND_PROBES`.
 * Each board has the seed `PROBE_SEED`. The function reads no clock, so each call gives the same probes.
 */
export function fingerprintProbes(): FingerprintProbe[] {
  const registry = highwaysRegistry();
  const probe = (family: string, dims: DimensionValues): FingerprintProbe => {
    const f = HIGHWAYS_FAMILIES.find((x) => x.name === family);
    if (f === undefined) throw new RangeError(`There is no family "${family}" for a probe.`);
    const suffix = Object.entries(dims).map(([k, v]) => `/${k}=${String(v)}`).join("");
    const graph = registry.generate(f.name, PROBE_SEED, dims, { version: f.version }).graph;
    return { id: `${f.name}@${f.version}${suffix}`, family: f.name, nodes: graph.nodes.length, band: portfolioBand(graph.nodes.length).id, graph };
  };
  return [...HIGHWAYS_FAMILIES.map((f) => probe(f.name, {})), ...BAND_PROBES.map((b) => probe(b.family, b.dims))];
}

/** This function gives the ids of the size bands of `PORTFOLIO_BANDS` that no probe of the list covers. A good list of probes leaves none. */
export function emptyBands(probes: readonly FingerprintProbe[]): string[] {
  return PORTFOLIO_BANDS.map((b) => b.id).filter((id) => !probes.some((p) => p.band === id));
}
