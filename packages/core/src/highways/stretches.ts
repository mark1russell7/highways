import { center, dist, type Point } from "../geom.ts";
import { nodeIndex, type Edge, type Graph } from "../model.ts";
import { placePlug, type Plug } from "../plugs.ts";
import { orderLanes } from "../segments.ts";
import { tidyPlan } from "./base.ts";
import { memberAt, type Highway, type HighwayMember, type HighwayPlan } from "./model.ts";

/** An edge with its two plugs, as the router `corners` places them. */
export interface EdgePlugs {
  readonly edge: Edge;
  readonly ps: Plug;
  readonly pt: Plug;
}

/** This function gives the plugs of each edge of the graph, in the order of the edges. An edge with an unknown node is not in the list. */
export function edgePlugs(graph: Graph): EdgePlugs[] {
  const byId = nodeIndex(graph);
  const out: EdgePlugs[] = [];
  for (const e of graph.edges) {
    const s = byId.get(e.source.node);
    const t = byId.get(e.target.node);
    if (!s || !t) continue;
    out.push({ edge: e, ps: placePlug(s, e.source, center(t.box)), pt: placePlug(t, e.target, center(s.box)) });
  }
  return out;
}

/** The way of one edge through the corner graph, with a key. Only the ways with one key share a highway. */
export interface KeyedWay {
  readonly edge: string;
  readonly key: string;
  /** The points of the way, without the plugs. Two ways share a link when the link has the same two points. */
  readonly points: readonly Point[];
}

/** The options of `sharedStretches`. */
export interface SharedStretchOptions {
  /** A highway has this number of edges or more. The value is 2 or more. */
  readonly minSize: number;
  /** This function tells if a link can be part of a highway. Without it, each link can. */
  readonly link?: (a: Point, b: Point) => boolean;
  /** This function removes the needless corners of a spine. Without it, the spine keeps each point of the stretch. */
  readonly pull?: (points: readonly Point[]) => Point[];
}

const pointKey = (p: Point): string => `${p.x},${p.y}`;
const linkKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** This function removes each point of a polyline that is equal to the point before it. */
const dedupe = (p: readonly Point[]): Point[] => p.filter((q, i) => i === 0 || dist(q, p[i - 1]!) > 1e-9);

/**
 * This function gives a highway for each stretch that two ways or more of one key share. A way is a polyline through the corner graph.
 * Each way breaks into stretches where the set of the ways on its links stays the same. The router `shared` makes its runs in the same way.
 * A stretch with fewer than `minSize` ways is not a highway. Each way joins the spine at one end of the stretch and leaves it at the other end.
 * The `seq` of each member follows the order of the stretches along the way.
 */
export function sharedStretches(ways: readonly KeyedWay[], o: Readonly<SharedStretchOptions>): HighwayPlan {
  const min = Math.max(2, o.minSize);
  const clean = ways.map((w) => ({ ...w, points: dedupe(w.points) }));
  const users = new Map<string, string[]>();
  const usable = (a: Point, b: Point): boolean => o.link?.(a, b) ?? true;
  for (const w of clean) {
    const own = new Set<string>();
    for (let i = 1; i < w.points.length; i++) {
      const a = w.points[i - 1]!;
      const b = w.points[i]!;
      if (usable(a, b)) own.add(`${w.key}\u0000${linkKey(pointKey(a), pointKey(b))}`);
    }
    for (const k of own) {
      const list = users.get(k);
      if (list) list.push(w.edge);
      else users.set(k, [w.edge]);
    }
  }
  interface Stretch {
    readonly key: string;
    readonly points: readonly Point[];
    readonly members: { edge: string; forward: boolean; at: number }[];
    /** The edges of `members`, so that the check of a member does not scan the list. */
    readonly seen: Set<string>;
  }
  const stretches = new Map<string, Stretch>();
  const wayOf = new Map<string, readonly Point[]>();
  // The signature of each link (ROUTE-SCALE): 0 for a link with fewer than `min` ways, else the number of the sorted list of its ways.
  // Each link gets its signature one time. Two links get the same number only when they have the same sorted list, so the stretches do not change.
  const texts = new Map<string, number>();
  const sigs = new Map<string, number>();
  const sigOf = (k: string): number => {
    let n = sigs.get(k);
    if (n !== undefined) return n;
    const list = users.get(k) ?? [];
    if (list.length < min) n = 0;
    else {
      const text = [...list].sort().join("\u0001");
      n = texts.get(text);
      if (n === undefined) texts.set(text, (n = texts.size + 1));
    }
    sigs.set(k, n);
    return n;
  };
  for (const w of clean) {
    wayOf.set(w.edge, w.points);
    const sig = (i: number): number => {
      const a = w.points[i]!;
      const b = w.points[i + 1]!;
      if (!usable(a, b)) return 0;
      return sigOf(`${w.key}\u0000${linkKey(pointKey(a), pointKey(b))}`);
    };
    let start = 0;
    for (let i = 0; i < w.points.length - 1; i++) {
      const s = sig(i);
      if (i + 1 < w.points.length - 1 && sig(i + 1) === s) continue;
      const from = start;
      start = i + 1;
      if (s === 0) continue;
      const a = pointKey(w.points[from]!);
      const b = pointKey(w.points[i + 1]!);
      if (a === b) continue;
      const id = `${w.key}\u0000${s}\u0000${linkKey(a, b)}`;
      const piece = w.points.slice(from, i + 2);
      let found = stretches.get(id);
      if (!found) stretches.set(id, (found = { key: w.key, points: a < b ? piece : [...piece].reverse(), members: [], seen: new Set() }));
      if (!found.seen.has(w.edge)) {
        found.seen.add(w.edge);
        found.members.push({ edge: w.edge, forward: a < b, at: from });
      }
    }
  }
  // The order of the stretches of each way gives the `seq` of its members.
  const kept = [...stretches.values()].filter((s) => s.members.length >= min);
  const order = new Map<string, { s: number; at: number }[]>();
  kept.forEach((s, si) => {
    for (const m of s.members) {
      const list = order.get(m.edge);
      if (list) list.push({ s: si, at: m.at });
      else order.set(m.edge, [{ s: si, at: m.at }]);
    }
  });
  const seq = new Map<string, number>();
  for (const [edge, list] of order) {
    list.sort((p, q) => p.at - q.at || p.s - q.s);
    list.forEach((x, k) => seq.set(`${x.s}\u0000${edge}`, k));
  }
  const highways: Highway[] = kept.map((s, si) => {
    const spine = o.pull ? o.pull(s.points) : [...s.points];
    const last = spine.length - 1;
    const lanes = orderLanes(
      s.points,
      s.members.map((m) => ({ edge: m.edge, points: wayOf.get(m.edge)! })),
      "bundle",
    );
    const byEdge = new Map(s.members.map((m) => [m.edge, m]));
    const members: HighwayMember[] = lanes.map((edge) => {
      const m = byEdge.get(edge)!;
      const k = seq.get(`${si}\u0000${edge}`) ?? 0;
      return m.forward ? memberAt(spine, edge, 0, last, k) : memberAt(spine, edge, last, 0, k);
    });
    return { id: `h${si}`, key: s.key, spine, lanes, members };
  });
  return tidyPlan({ highways });
}
