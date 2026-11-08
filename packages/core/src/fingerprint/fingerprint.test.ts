import { fingerprintOf, outputHash, REFUSED_PROBE } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { resultHash } from "../bench/screen/exercise.ts";
import { HIGHWAYS_FAMILIES } from "../families/index.ts";
import type { Graph } from "../model.ts";
import { PORTFOLIO_BANDS } from "../portfolio/bands.ts";
import { createRegistry, defineStrategy, listStrategies } from "../strategies/model.ts";
import { KEYED_STRATEGIES } from "../strategies/opt-in.ts";
import { resultForm } from "./form.ts";
import { BAND_PROBES, emptyBands, fingerprintProbes, type FingerprintProbe } from "./probes.ts";
import { FINGERPRINT_HASH, fingerprintFindings, readEntry, routeProbe, routerEntries, type ProbeRoute, type RouterEntry } from "./read.ts";
import { ENTRY_FINGERPRINTS } from "./table.ts";

const PROBES = fingerprintProbes();
const ENTRIES = routerEntries();
const entry = (key: string): RouterEntry => ENTRIES.find((e) => e.key === key)!;

/** This function gives the graph with the source node of the first edge 3 units to the right and 3 units down. */
function moved(graph: Graph): Graph {
  const first = graph.edges[0]!.source.node;
  return { ...graph, nodes: graph.nodes.map((n) => (n.id === first ? { ...n, box: { ...n.box, x: n.box.x + 3, y: n.box.y + 3 } } : n)) };
}

describe("fingerprintProbes", () => {
  it("gives one probe for each family at its defaults, with unique ids", () => {
    const ids = PROBES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of HIGHWAYS_FAMILIES) expect(ids, f.name).toContain(`${f.name}@${f.version}`);
    expect(PROBES.length).toBe(HIGHWAYS_FAMILIES.length + BAND_PROBES.length);
  });

  it("covers each size band of the portfolio", () => {
    expect(emptyBands(PROBES)).toEqual([]);
    expect(new Set(PROBES.map((p) => p.band))).toEqual(new Set(PORTFOLIO_BANDS.map((b) => b.id)));
    expect(Math.min(...PROBES.map((p) => p.nodes))).toBeLessThanOrEqual(12);
  });

  it("gives the same boards on a second call", () => {
    expect(JSON.stringify(fingerprintProbes())).toBe(JSON.stringify(PROBES));
  });
});

describe("routerEntries", () => {
  it("gives each router and highway strategy of KEYED_STRATEGIES, each with a row of the table", () => {
    const count = listStrategies(KEYED_STRATEGIES, "router").length + listStrategies(KEYED_STRATEGIES, "highway").length;
    expect(ENTRIES.length).toBe(count);
    expect(new Set(ENTRIES.map((e) => e.key)).size).toBe(count);
    for (const e of ENTRIES) {
      expect(e.key).toBe(`${e.step}/${e.name}`);
      expect(e.router.step).toBe("router");
      expect(e.fingerprint, e.key).toBe(ENTRY_FINGERPRINTS[e.key]);
      expect(e.fingerprint, e.key).toMatch(/^[0-9a-f]{16}$/u);
    }
    expect(Object.keys(ENTRY_FINGERPRINTS).sort()).toEqual(ENTRIES.map((e) => e.key).sort());
  });

  it("gives no fingerprint to a strategy of another registry with the key of a built-in entry", () => {
    const shared = listStrategies(KEYED_STRATEGIES, "router").find((s) => s.name === "shared")!;
    const copy = defineStrategy({ step: "router", name: "shared", describe: "A made-up copy.", defaults: {}, run: (graph: Graph) => shared.run(graph) });
    const [own] = routerEntries(createRegistry([copy]));
    expect(own?.key).toBe("router/shared");
    expect(own?.fingerprint).toBeUndefined();
  });
});

describe("readEntry", () => {
  it("gives the same fingerprints on a second read", () => {
    for (const key of ["router/straight", "router/corners", "highway/shared-ways"]) {
      const a = readEntry(entry(key), PROBES);
      const b = readEntry(entry(key), PROBES);
      expect(b.hashes, key).toEqual(a.hashes);
      expect(b.fingerprint, key).toBe(a.fingerprint);
    }
  });

  it("gives the fingerprints of the table for two entries", () => {
    for (const key of ["router/straight", "router/corners"]) expect(readEntry(entry(key), PROBES).fingerprint, key).toBe(ENTRY_FINGERPRINTS[key]);
  });

  it("moves the fingerprint when the probe of one family changes, for each family", () => {
    const straight = entry("router/straight");
    const base = readEntry(straight, PROBES);
    for (const probe of PROBES) {
      const changed: FingerprintProbe = { ...probe, graph: moved(probe.graph) };
      const read = readEntry(straight, PROBES.map((p) => (p.id === probe.id ? changed : p)));
      expect(read.hashes[probe.id], probe.id).not.toBe(REFUSED_PROBE);
      expect(read.hashes[probe.id], probe.id).not.toBe(base.hashes[probe.id]);
      expect(read.fingerprint, probe.id).not.toBe(base.fingerprint);
    }
  });

  it("hashes the exact numbers of resultForm, without the field through", () => {
    const some = PROBES.slice(0, 3);
    const straight = entry("router/straight");
    const base = readEntry(straight, some);
    const through: ProbeRoute = (router, graph) => {
      const result = routeProbe(router, graph);
      return { ...result, routes: result.routes.map((r) => ({ ...r, through: ["made-up-box"] })) };
    };
    const shift: ProbeRoute = (router, graph) => {
      const result = routeProbe(router, graph);
      const [first, ...rest] = result.routes;
      return { ...result, routes: [{ ...first!, points: first!.points.map((p) => ({ x: p.x + 1e-9, y: p.y })) }, ...rest] };
    };
    expect(readEntry(straight, some, through).fingerprint).toBe(base.fingerprint);
    expect(readEntry(straight, some, shift).fingerprint).not.toBe(base.fingerprint);
    const result = routeProbe(straight.router, some[0]!.graph);
    expect(base.hashes[some[0]!.id]).toBe(outputHash(resultForm(result), FINGERPRINT_HASH));
    expect(base.fingerprint).toBe(fingerprintOf(base.hashes));
    expect(resultHash(result)).toBe(outputHash(resultForm(result)));
  });

  it("gives the refused token to a probe that throws, with no reason text in the hash", () => {
    const some = PROBES.slice(0, 2);
    const fail = (text: string): ProbeRoute => () => {
      throw new RangeError(text);
    };
    const a = readEntry(entry("router/straight"), some, fail("a made-up fault"));
    const b = readEntry(entry("router/straight"), some, fail("another made-up fault"));
    expect(Object.values(a.hashes)).toEqual([REFUSED_PROBE, REFUSED_PROBE]);
    expect(a.refused[some[0]!.id]).toBe("a made-up fault");
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it("refuses a probe with more nodes than maxNodes, and does not route it", () => {
    let calls = 0;
    const small = defineStrategy({ step: "router", name: "made-up-small", describe: "A made-up router.", defaults: {}, maxNodes: 12, run: (graph: Graph) => (calls++, routeProbe(entry("router/straight").router, graph)) });
    const read = readEntry({ key: "router/made-up-small", router: small }, PROBES);
    const over = PROBES.filter((p) => p.nodes > 12);
    expect(Object.keys(read.refused).sort()).toEqual(over.map((p) => p.id).sort());
    expect(calls).toBe(PROBES.length - over.length);
  });
});

describe("fingerprintFindings", () => {
  it("names a changed, a missing and an extra entry, and an entry that refuses each probe", () => {
    const some = PROBES.slice(0, 2);
    const read = readEntry(entry("router/straight"), some);
    const blind = readEntry(entry("router/corners"), some, () => {
      throw new RangeError("a made-up fault");
    });
    expect(fingerprintFindings({ "router/straight": read.fingerprint }, [read])).toEqual([]);
    const findings = fingerprintFindings({ "router/straight": "0000000000000000", "router/gone": "1111111111111111" }, [read, blind]);
    expect(findings).toHaveLength(4);
    expect(findings[0]).toContain("router/straight: the fingerprint changed");
    expect(findings[1]).toContain("router/corners: the table has no fingerprint");
    expect(findings[2]).toContain("router/gone");
    expect(findings[3]).toContain("router/corners: the entry refuses each of the 2 probes");
    expect(fingerprintFindings({ "router/gone": "1111111111111111" }, [], false)).toEqual([]);
  });
});
