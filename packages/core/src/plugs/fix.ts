/**
 * Fixed ports from a plug rule (FIX-PORTS): the plugs of the rule become the fixed `at` of the ports.
 * Then each router takes each plug rule, because each router keeps a fixed plug at its point.
 */
import { nearestSide, SIDE_NORMAL, type Plug } from "../plugs.ts";
import { nodeIndex, portOffset, resolvePorts, splitFrames, type Edge, type End, type Graph, type Node, type Port, type Side } from "../model.ts";
import { STRATEGIES } from "../strategies/builtins.ts";
import { getStrategy, type Registry, type Strategy } from "../strategies/model.ts";
import { WayFinder, type WayOptions } from "../ways.ts";
import { alongAxis, placeInIntervals, rangeInterval } from "./range.ts";

/** The options of `fixPorts`. */
export interface FixPortsOptions {
  /** The options of the plug rule. The rule gets its `defaults` for each option that this object does not give. */
  readonly plugOptions?: object;
  /** The registry that gives the rule by its name. The default is `STRATEGIES`. */
  readonly registry?: Registry;
  /** The options of the way finder that a rule reads, for example `side`. The defaults are the defaults of the router `corners`. */
  readonly ways?: WayOptions;
  /**
   * With `true`, an end without a port gets a new fixed port, with the id `<edge id>:source` or `<edge id>:target`.
   * The default is `false`: such an end stays free.
   */
  readonly newPorts?: boolean;
  /**
   * The plugs of ports with a `range` (PORT-RANGE). With `keep`, a plug out of its range moves into it, and the new plugs of its side keep their order.
   * With `rule`, each plug stays where the rule puts it. The default is `keep`, but `rule` for the rule `assign`: its plugs out of their ranges are on purpose.
   */
  readonly ranges?: "keep" | "rule";
}

/** This function gives the side of a plug from its normal. */
function sideOf(plug: Plug, node: Node): Side {
  for (const [side, n] of Object.entries(SIDE_NORMAL) as [Side, { x: number; y: number }][]) if (n.x === plug.normal.x && n.y === plug.normal.y) return side;
  return nearestSide(node.box, plug.point);
}

/**
 * This function moves the new fixed ports of each side of a node into their ranges (PORT-RANGE), when one of them is out of its range.
 * The ports of the side keep their order, and two of them keep at least `gap` (`placeInIntervals`). A side with each port in its range does not change.
 */
function keepInRanges(node: Node, ports: Map<string, Port>, gap: number, inset: number): void {
  const bySide = new Map<Side, Port[]>();
  for (const p of ports.values()) {
    const list = bySide.get(p.side!);
    if (list) list.push(p);
    else bySide.set(p.side!, [p]);
  }
  const box = node.box;
  for (const [side, list] of bySide) {
    const along = alongAxis(side);
    const v = (p: Port): number => p.at![along] + (along === "y" ? box.y : box.x);
    const out = list.some((p) => {
      const r = rangeInterval(box, side, p, inset);
      return r !== undefined && (v(p) < r[0] - 1e-6 || v(p) > r[1] + 1e-6);
    });
    if (!out) continue;
    const start = along === "y" ? box.y : box.x;
    const len = along === "y" ? box.h : box.w;
    const sorted = [...list].sort((a, b) => v(a) - v(b));
    const span = sorted.map((p): [number, number] => rangeInterval(box, side, p, inset) ?? [start, start + len]);
    const at = placeInIntervals(
      sorted.map(v),
      span.map((r) => r[0]),
      span.map((r) => r[1]),
      gap,
    );
    sorted.forEach((p, i) => {
      const point = { ...p.at!, [along]: at[i]! - start };
      ports.set(p.id, { ...p, at: point });
    });
  }
}

/** This function gives an id that no port of the node has, from `base`. */
function freeId(taken: Set<string>, base: string): string {
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}#${i}`;
  taken.add(id);
  return id;
}

/**
 * This function runs the plug rule. It gives each free port a fixed `at` and a `side` from the plugs of the rule.
 * A free port has no `at` and no `along`. A port of several ends takes the plug of its first end, in the order of the edges.
 * A fixed port keeps its values, and a port of no edge stays free.
 *
 * The rule sees the graph of `corners`: the plugs of `resolvePorts`, without the inner edges of the frames.
 * The rule is a strategy of the step `plugs`, or the name of one in the registry.
 * A new fixed port with a `range` is in its range (PORT-RANGE). When the rule gives a plug out of the range, the new plugs of that side move into their ranges.
 * The output is a new graph. The function does not change the input.
 */
export function fixPorts(graph: Graph, rule: Strategy<"plugs"> | string, options: FixPortsOptions = {}): Graph {
  const strategy = typeof rule === "string" ? getStrategy(options.registry ?? STRATEGIES, "plugs", rule) : rule;
  const outer = splitFrames(resolvePorts(graph)).graph;
  const pairs = strategy.run({ graph: outer, ways: new WayFinder(outer.nodes, options.ways) }, options.plugOptions);
  const byEdge = new Map<string, (typeof pairs)[number][]>();
  for (const p of pairs) {
    const list = byEdge.get(p.edge);
    if (list) list.push(p);
    else byEdge.set(p.edge, [p]);
  }
  const byId = nodeIndex(graph);
  // The new fixed ports of each node, by the port id, and the new ports for the ends without a port.
  const fixed = new Map<string, Map<string, Port>>();
  const added = new Map<string, Port[]>();
  const taken = new Map<string, Set<string>>();
  const portsOf = (node: Node): Map<string, Port> => {
    let m = fixed.get(node.id);
    if (!m) fixed.set(node.id, (m = new Map()));
    return m;
  };
  const fix = (node: Node, plug: Plug, base: Port): Port => ({
    ...base,
    side: sideOf(plug, node),
    at: { x: plug.point.x - node.box.x, y: plug.point.y - node.box.y },
  });
  // The outer graph has the edge objects of the input. An inner edge keeps its ends, because the rule did not see it.
  const outerEdges = new Set(outer.edges);
  const edges = graph.edges.map((e): Edge => {
    if (!outerEdges.has(e)) return e;
    const pair = byEdge.get(e.id)?.shift();
    if (!pair) return e;
    const end = (which: "source" | "target", plug: Plug): End => {
      const own = e[which];
      const node = byId.get(own.node);
      if (!node) return own;
      if (own.port === undefined) {
        if (!options.newPorts) return own;
        let ids = taken.get(node.id);
        if (!ids) taken.set(node.id, (ids = new Set((node.ports ?? []).map((p) => p.id))));
        const id = freeId(ids, `${e.id}:${which}`);
        const list = added.get(node.id) ?? [];
        list.push(fix(node, plug, { id }));
        added.set(node.id, list);
        return { ...own, port: id };
      }
      const port = node.ports?.find((p) => p.id === own.port);
      if (!port || portOffset(node.box, port) !== undefined) return own;
      const m = portsOf(node);
      if (!m.has(port.id)) m.set(port.id, fix(node, plug, port));
      return own;
    };
    const source = end("source", pair.source);
    const target = end("target", pair.target);
    return source === e.source && target === e.target ? e : { ...e, source, target };
  });
  // A rule can give a plug out of the range of its port (PORT-RANGE). Then the new plugs of that side move into their ranges.
  const own = strategy.defaults as { readonly plugGap?: unknown; readonly inset?: unknown };
  const given = (options.plugOptions ?? {}) as { readonly plugGap?: unknown; readonly inset?: unknown };
  const num = (a: unknown, b: unknown, c: number): number => (typeof a === "number" ? a : typeof b === "number" ? b : c);
  const gap = num(given.plugGap, own.plugGap, 0);
  const inset = num(given.inset, own.inset, 6);
  const ranges = options.ranges ?? (strategy.name === "assign" ? "rule" : "keep");
  for (const [id, m] of fixed) {
    const node = byId.get(id);
    if (node && ranges === "keep") keepInRanges(node, m, gap, inset);
  }
  const nodes = graph.nodes.map((n): Node => {
    const m = fixed.get(n.id);
    const more = added.get(n.id);
    if (!m && !more) return n;
    const ports = (n.ports ?? []).map((p) => m?.get(p.id) ?? p);
    return { ...n, ports: more ? [...ports, ...more] : ports };
  });
  return { ...graph, nodes, edges };
}
