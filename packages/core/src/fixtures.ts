import type { Box, Point } from "./geom.ts";
import { Grid } from "./grid.ts";
import type { Edge, Graph, Node, Port, Side } from "./model.ts";

/** This function gives a seeded random source with values in [0, 1) (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The ways a fixture puts its nodes and picks its edges. In `collections`, each cluster is one collection,
 * and some nodes link to many nodes of one other collection (a fan-out).
 */
export type FixtureKind = "uniform" | "clustered" | "grid" | "hubs" | "collections";

/** The parameters of a generated graph. */
export interface FixtureSpec {
  readonly name: string;
  readonly kind: FixtureKind;
  readonly nodes: number;
  /** The number of edges is about `nodes × edgesPerNode`. */
  readonly edgesPerNode: number;
  readonly seed: number;
  /** This share of the edges, from 0 to 1, joins a node near the source. */
  readonly locality?: number;
  /** This share of the nodes, from 0 to 1, has one fixed plug that its outgoing edges use. */
  readonly fixedPorts?: number;
}

/** The fixtures of the benchmark, from 10 to 100 000 nodes. */
export const FIXTURES: readonly FixtureSpec[] = [
  { name: "tiny-uniform", kind: "uniform", nodes: 10, edgesPerNode: 1.5, seed: 1 },
  { name: "small-clustered", kind: "clustered", nodes: 100, edgesPerNode: 2, seed: 2, fixedPorts: 0.2 },
  { name: "grid-400", kind: "grid", nodes: 400, edgesPerNode: 2, seed: 3 },
  { name: "mid-uniform", kind: "uniform", nodes: 1000, edgesPerNode: 2, seed: 4 },
  { name: "mid-clustered", kind: "clustered", nodes: 1000, edgesPerNode: 3, seed: 5, fixedPorts: 0.2 },
  { name: "mid-hubs", kind: "hubs", nodes: 1000, edgesPerNode: 2, seed: 6 },
  { name: "mid-fanout", kind: "collections", nodes: 1000, edgesPerNode: 2, seed: 9 },
  { name: "large-clustered", kind: "clustered", nodes: 10_000, edgesPerNode: 3, seed: 7 },
  { name: "huge-clustered", kind: "clustered", nodes: 100_000, edgesPerNode: 2, seed: 8 },
];

const COLLECTIONS = ["users", "modes", "speeds", "scores", "teams"] as const;
const SIDES: readonly Side[] = ["north", "east", "south", "west"];
const GAP = 12;
const SPACING = 90;

/** This function gives the seed of the random numbers of a fixture: `(seed × 2654435761 + nodes) >>> 0`. */
export function fixtureRngSeed(seed: number, nodes: number): number {
  return (seed * 2654435761 + nodes) >>> 0;
}

/**
 * This function makes the graph of a fixture. The same spec always gives the same graph.
 * Node boxes do not overlap, and a gap of 12 units stays between them.
 * The default source of random numbers is `rng(fixtureRngSeed(spec.seed, spec.nodes))`. A corpus family gives the same stream from its registry.
 */
export function makeFixture(spec: FixtureSpec, random: () => number = rng(fixtureRngSeed(spec.seed, spec.nodes))): Graph {
  const R = random;
  const gauss = (): number => Math.sqrt(-2 * Math.log(R() + 1e-12)) * Math.cos(2 * Math.PI * R());
  const side = Math.sqrt(spec.nodes) * SPACING;
  const grid = new Grid<Box>(SPACING);
  const nodes: Node[] = [];
  const clusterOf: number[] = [];
  const free = (b: Box): boolean => {
    let ok = true;
    const g: Box = { x: b.x - GAP, y: b.y - GAP, w: b.w + 2 * GAP, h: b.h + 2 * GAP };
    grid.query(g, (o) => {
      if (ok && o.x < g.x + g.w && g.x < o.x + o.w && o.y < g.y + g.h && g.y < o.y + o.h) ok = false;
    });
    return ok;
  };
  const centers: Point[] = Array.from({ length: Math.max(3, Math.round(Math.sqrt(spec.nodes) / 3)) }, () => ({
    x: side * (0.1 + 0.8 * R()),
    y: side * (0.1 + 0.8 * R()),
  }));
  const spread = side / (2.5 * Math.sqrt(centers.length));
  const cols = Math.ceil(Math.sqrt(spec.nodes));
  let tries = 0;
  while (nodes.length < spec.nodes && tries++ < spec.nodes * 200) {
    const w = 30 + Math.floor(R() * 30);
    const h = 18 + Math.floor(R() * 12);
    let cx: number;
    let cy: number;
    let cluster = -1;
    if (spec.kind === "grid") {
      const i = nodes.length;
      cx = ((i % cols) + 0.5) * SPACING;
      cy = (Math.floor(i / cols) + 0.5) * SPACING;
    } else if (spec.kind === "clustered" || spec.kind === "collections") {
      cluster = Math.floor(R() * centers.length);
      const c = centers[cluster]!;
      cx = c.x + gauss() * spread;
      cy = c.y + gauss() * spread;
    } else {
      cx = R() * side;
      cy = R() * side;
    }
    const box: Box = { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h };
    if (spec.kind !== "grid" && !free(box)) continue;
    grid.add(box, box);
    clusterOf.push(cluster);
    const id = `n${nodes.length}`;
    if (R() < (spec.fixedPorts ?? 0)) {
      const s = SIDES[Math.floor(R() * 4)]!;
      const t = 0.2 + 0.6 * R();
      const at: Point =
        s === "north" ? { x: w * t, y: 0 } : s === "south" ? { x: w * t, y: h } : s === "west" ? { x: 0, y: h * t } : { x: w, y: h * t };
      const ports: Port[] = [{ id: "out", at: { x: Math.round(at.x), y: Math.round(at.y) } }];
      nodes.push({ id, box, ports });
    } else nodes.push({ id, box });
  }
  return { nodes, edges: makeEdges(spec, nodes, clusterOf, R) };
}

function makeEdges(spec: FixtureSpec, nodes: readonly Node[], clusterOf: readonly number[], R: () => number): Edge[] {
  const n = nodes.length;
  if (n < 2) return [];
  const locality = spec.locality ?? 0.65;
  const near = new Grid<number>(SPACING * 2);
  nodes.forEach((v, i) => near.add(i, v.box));
  const kindOf =
    spec.kind === "collections"
      ? clusterOf.map((c) => `${COLLECTIONS[c % COLLECTIONS.length]!}-${c}`)
      : nodes.map(() => COLLECTIONS[Math.floor(R() * COLLECTIONS.length)]!);
  // Hubs: a few nodes get most of the far edges (preferential attachment by a power law).
  const pickFar = (): number => (spec.kind === "hubs" ? Math.floor(n * R() ** 3) : Math.floor(R() * n));
  const target = Math.round(n * spec.edgesPerNode);
  const seen = new Set<string>();
  const edges: Edge[] = [];
  const add = (u: number, v: number): void => {
    const key = u < v ? `${u}-${v}` : `${v}-${u}`;
    if (u === v || seen.has(key)) return;
    seen.add(key);
    const src = nodes[u]!;
    edges.push({
      id: `e${edges.length}`,
      source: src.ports ? { node: src.id, port: "out" } : { node: src.id },
      target: { node: nodes[v]!.id },
      data: { collection: kindOf[v]! },
    });
  };
  if (spec.kind === "collections") {
    // Six of ten edges are fan-outs: a node links to 4 to 15 nodes of one other cluster.
    const members = new Map<number, number[]>();
    clusterOf.forEach((c, i) => {
      const list = members.get(c);
      if (list) list.push(i);
      else members.set(c, [i]);
    });
    const clusters = [...members.keys()].sort((a, c) => a - c);
    let rounds = 0;
    while (edges.length < target * 0.6 && clusters.length > 1 && rounds++ < target) {
      const u = Math.floor(R() * n);
      const others = clusters.filter((c) => c !== clusterOf[u]);
      const pool = members.get(others[Math.floor(R() * others.length)]!)!;
      const fan = 4 + Math.floor(R() * 12);
      for (let i = 0; i < fan; i++) add(u, pool[Math.floor(R() * pool.length)]!);
    }
  }
  let tries = 0;
  while (edges.length < target && tries++ < target * 30) {
    const u = Math.floor(R() * n);
    let v = -1;
    if (R() < locality) {
      const b = nodes[u]!.box;
      const cand: number[] = [];
      for (let r = SPACING; cand.length < 8 && r < SPACING * 64; r *= 2) {
        cand.length = 0;
        near.query({ x: b.x - r, y: b.y - r, w: b.w + 2 * r, h: b.h + 2 * r }, (i) => {
          if (i !== u) cand.push(i);
        });
      }
      cand.sort((a, c) => a - c);
      if (cand.length) v = cand[Math.floor(R() * cand.length)]!;
    } else v = pickFar();
    if (v >= 0) add(u, v);
  }
  return edges;
}
