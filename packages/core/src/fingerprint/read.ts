// The fingerprint of each keyed router (ENTRY-FINGERPRINT). The hash of a probe is `probeHash` of `@mark1russell7/layout-contract` over `resultForm`,
// with exact numbers and without the field `through`. The fingerprint is `fingerprintOf` of the probe hashes. The engine `packing` gives the same field.
import { fingerprintOf, probeHash, REFUSED_PROBE, type HashOptions } from "@mark1russell7/layout-contract";
import { highwayRouterStrategy } from "../highways/router.ts";
import type { Graph, Result } from "../model.ts";
import { listStrategies, type Registry, type Strategy } from "../strategies/model.ts";
import { KEYED_STRATEGIES, keyOfStrategy, strategyOfKey } from "../strategies/opt-in.ts";
import { resultForm } from "./form.ts";
import type { FingerprintProbe } from "./probes.ts";
import { ENTRY_FINGERPRINTS } from "./table.ts";

/**
 * The hash options of a probe. The grid `0` keeps the exact numbers, so each change of a number changes the hash.
 * The field `through` is a report of the boxes that a route goes through. The digest of the router `sections` also leaves it out.
 */
export const FINGERPRINT_HASH: HashOptions = Object.freeze({ grid: 0, skip: Object.freeze(["through"]) });

/** One keyed router of a registry: a router strategy, or a highway strategy that `follow` routes. */
export interface RouterEntry {
  /** The key of the strategy, from `keyOfStrategy`: `router/<name>` or `highway/<name>`. */
  readonly key: string;
  readonly step: "router" | "highway";
  readonly name: string;
  /** The router of the entry: the router strategy itself, or `highwayRouterStrategy` of the highway strategy. */
  readonly router: Strategy<"router", object>;
  /**
   * The fingerprint of the outputs of the entry on `fingerprintProbes`, from the table of the release. It has 16 lowercase hex digits.
   * Only an entry of `KEYED_STRATEGIES` itself gets it. A strategy of another registry with the same key does not get it.
   */
  readonly fingerprint?: string;
}

/**
 * This function gives the keyed routers of a registry: each router strategy, then each highway strategy, in the order of the registry.
 * The default registry is `KEYED_STRATEGIES`. The field `fingerprint` comes from `table` for each entry of `KEYED_STRATEGIES` with a row.
 */
export function routerEntries(registry: Registry = KEYED_STRATEGIES, table: Readonly<Record<string, string>> = ENTRY_FINGERPRINTS): RouterEntry[] {
  const own = (strategy: Strategy<"router" | "highway", object>, key: string): boolean => {
    const found = strategyOfKey(key);
    return found.ok && (found.strategy as unknown) === strategy;
  };
  const entry = (step: "router" | "highway", strategy: Strategy<"router" | "highway", object>, router: Strategy<"router", object>): RouterEntry => {
    const key = keyOfStrategy(strategy as Strategy<"router", object>);
    const fingerprint = own(strategy, key) ? table[key] : undefined;
    return { key, step, name: strategy.name, router, ...(fingerprint === undefined ? {} : { fingerprint }) };
  };
  return [
    ...listStrategies(registry, "router").map((s) => entry("router", s, s as Strategy<"router", object>)),
    ...listStrategies(registry, "highway").map((s) => entry("highway", s, highwayRouterStrategy(s as Strategy<"highway", object>))),
  ];
}

/** The function that routes one probe with the router of an entry. A test gives a function with a change. */
export type ProbeRoute = (router: Strategy<"router", object>, graph: Graph) => Result;

/** This function routes a graph with the defaults of a router strategy. */
export const routeProbe: ProbeRoute = (router, graph) => router.run(graph);

/** The read of one entry over the probes. */
export interface EntryRead {
  readonly key: string;
  /** The hash of each probe, by the id of the probe. A refused probe has the hash `REFUSED_PROBE`. */
  readonly hashes: Readonly<Record<string, string>>;
  /** The reason of each refused probe, by the id of the probe. The hash does not read the reason. */
  readonly refused: Readonly<Record<string, string>>;
  /** The value of `fingerprintOf` over `hashes`. */
  readonly fingerprint: string;
}

/**
 * This function reads one entry over the probes. A probe with more nodes than `maxNodes` of the router is refused, and the router does not route it.
 * A probe where the router throws is refused too. The hash of a refused probe is `REFUSED_PROBE`, with no reason text.
 * The function throws a `RangeError` when the list has no probe.
 */
export function readEntry(entry: Pick<RouterEntry, "key" | "router">, probes: readonly FingerprintProbe[], route: ProbeRoute = routeProbe): EntryRead {
  const hashes: Record<string, string> = {};
  const refused: Record<string, string> = {};
  const max = entry.router.maxNodes;
  for (const probe of probes) {
    if (max !== undefined && probe.nodes > max) {
      hashes[probe.id] = REFUSED_PROBE;
      refused[probe.id] = `The probe has ${probe.nodes} nodes, and the router takes ${max} or fewer.`;
      continue;
    }
    const why = (error: unknown): boolean => {
      refused[probe.id] = error instanceof Error ? error.message : String(error);
      return true;
    };
    hashes[probe.id] = probeHash(() => resultForm(route(entry.router, probe.graph)), why, FINGERPRINT_HASH);
  }
  return { key: entry.key, hashes, refused, fingerprint: fingerprintOf(hashes) };
}

/**
 * This function compares the fingerprints of a table with some reads. Each finding is one sentence that names an entry.
 * With `all`, an entry of the table without a read is a finding.
 */
export function fingerprintFindings(table: Readonly<Record<string, string>>, reads: readonly EntryRead[], all = true): string[] {
  const findings: string[] = [];
  const read = new Set<string>();
  for (const r of reads) {
    read.add(r.key);
    const was = table[r.key];
    if (was === undefined) findings.push(`${r.key}: the table has no fingerprint. The read gives ${r.fingerprint}.`);
    else if (was !== r.fingerprint) findings.push(`${r.key}: the fingerprint changed from ${was} to ${r.fingerprint}.`);
  }
  if (all) for (const key of Object.keys(table)) if (!read.has(key)) findings.push(`${key}: the table has a fingerprint, but the registry has no such entry.`);
  for (const r of reads) {
    const count = Object.keys(r.hashes).length;
    if (count > 0 && Object.keys(r.refused).length === count) findings.push(`${r.key}: the entry refuses each of the ${count} probes, so its fingerprint does not show a change of its output.`);
  }
  return findings;
}
