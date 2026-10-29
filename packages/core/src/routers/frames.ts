import { center, dist, type Box, type Point } from "../geom.ts";
import { fixedPortPoint, nodeIndex, type Graph, type InnerEdge, type Node, type Route } from "../model.ts";
import { placePlug, type Plug } from "../plugs.ts";
import { WayFinder, type WayOptions } from "../ways.ts";
import { gutterRoutes, type GutterEdge } from "./gutter.ts";

/**
 * The rule for a node box that is not fully inside the box of its frame.
 * With `throw`, the router throws a `RangeError`. With `skip`, the node is not an obstacle, and its inner edges get no route.
 * With `clamp`, the router cuts the box to the bounds of the frame.
 */
export type Outside = "throw" | "skip" | "clamp";

/**
 * The mode of the inner routes. With `corners`, the corner graph gives each route, in the box of the frame smaller by `frameInset`.
 * With `gutter`, each route is orthogonal in the free room of the frame box: the gaps between the nodes and the strips at the walls.
 */
export type InnerMode = "corners" | "gutter";

/** The options of the inner routes: the options of the way finder, the rule `outside`, the inset `frameInset`, the mode `inner` and `bendCost`. */
export interface FrameOptions extends WayOptions {
  /** The rule for a node box outside the box of its frame. The default is `throw`. */
  readonly outside?: Outside;
  /** The distance from the walls of a frame to the bounds of its inner routes. The default is the margin of the router. The mode `gutter` does not use it. */
  readonly frameInset?: number;
  /** The mode of the inner routes. The default is `corners`. */
  readonly inner?: InnerMode;
  /** The cost of one bend of an inner route of the mode `gutter`, in units of length. The default is 16. */
  readonly bendCost?: number;
}

/** The inside of one frame for the inner edges to one depth: the bounds, the way finder and the obstacles by id. */
interface Room {
  readonly ways: WayFinder;
  readonly nodes: ReadonlyMap<string, Node>;
}

/** The tiny gap between the bounds and the band of a wall, so that a way along the bounds stays clear of the wall. */
const EPS = 1e-6;

/**
 * This function gives the inner routes of the inner edges (`splitFrames`). Each route stays in the bounds of its frame:
 * the box of the frame, smaller by `frameInset`. It goes around the other nodes of the frame.
 * It leaves the plug of the frame into the frame, along the normal of the wall. Each route has the id of its frame in `frame`.
 */
export function frameRoutes(graph: Graph, inner: readonly InnerEdge[], options: FrameOptions): Route[] {
  const byId = nodeIndex(graph);
  const children = new Map<string, Node[]>();
  for (const n of graph.nodes) {
    if (n.parent === undefined) continue;
    const list = children.get(n.parent);
    if (list) list.push(n);
    else children.set(n.parent, [n]);
  }
  if (options.inner === "gutter") return gutterFrameRoutes(inner, options, byId, children);
  const margin = options.margin ?? 5;
  const inset = options.frameInset ?? margin;
  const rooms = new Map<string, Room>();
  const routes: Route[] = [];
  for (const { edge, frame, plug } of inner) {
    const f = byId.get(frame)!;
    const [own, far] = plug === "source" ? [edge.source, edge.target] : [edge.target, edge.source];
    const chain = chainOf(byId, frame, far.node);
    const key = JSON.stringify([frame, ...chain]);
    let room = rooms.get(key);
    if (!room) rooms.set(key, (room = makeRoom(f, chain, children, byId, inset, options)));
    const end = room.nodes.get(far.node);
    if (!end) continue;
    const fp = placePlug(f, own, center(end.box));
    const inward = { x: -fp.normal.x, y: -fp.normal.y };
    // The way starts on the bounds, straight in from the plug of the wall.
    const start: Plug = { point: { x: fp.point.x + inward.x * inset, y: fp.point.y + inward.y * inset }, normal: inward };
    const ep = placePlug(end, far, fp.point);
    const ends = new Set<Node>([end]);
    const points =
      plug === "source" ? stub(fp.point, room.ways.between(start, ep, ends)) : stub(fp.point, room.ways.between(ep, start, ends).reverse()).reverse();
    routes.push({ edge: edge.id, points, frame });
  }
  return routes;
}

/** This function gives the nodes between the frame and the far end, the nearest first. Each of them holds the far end, so it is not an obstacle. */
function chainOf(byId: ReadonlyMap<string, Node>, frame: string, far: string): string[] {
  const chain: string[] = [];
  for (let p = byId.get(far)!.parent!; p !== frame; p = byId.get(p)!.parent!) chain.push(p);
  return chain;
}

/**
 * This function gives the inner routes of the mode `gutter`. The inner edges of one room route together, so that they share the gaps in lanes.
 * A route is orthogonal, in the free room of the frame box. An edge without a way through the free room gets no route.
 */
function gutterFrameRoutes(inner: readonly InnerEdge[], options: FrameOptions, byId: ReadonlyMap<string, Node>, children: ReadonlyMap<string, readonly Node[]>): Route[] {
  const rooms = new Map<string, { readonly nodes: Map<string, Node>; readonly items: { at: number; edge: GutterEdge }[]; readonly frame: Box }>();
  const routes: (Route | undefined)[] = inner.map(() => undefined);
  inner.forEach(({ edge, frame, plug }, at) => {
    const f = byId.get(frame)!;
    const [own, far] = plug === "source" ? [edge.source, edge.target] : [edge.target, edge.source];
    const chain = chainOf(byId, frame, far.node);
    const key = JSON.stringify([frame, ...chain]);
    let room = rooms.get(key);
    if (!room) rooms.set(key, (room = { nodes: roomNodes(f, chain, children, byId, f.box, options), items: [], frame: f.box }));
    const end = room.nodes.get(far.node);
    if (!end) return;
    const fp = placePlug(f, own, center(end.box));
    const port = fixedPortPoint(end, far) === undefined ? undefined : placePlug(end, far, fp.point);
    const side = far.port === undefined ? undefined : end.ports?.find((p) => p.id === far.port)?.side;
    room.items.push({ at, edge: { plug: fp, end, ...(port ? { port } : {}), ...(side ? { side } : {}) } });
  });
  for (const room of rooms.values()) {
    const found = gutterRoutes(
      room.frame,
      [...room.nodes.values()],
      room.items.map((i) => i.edge),
      { laneGap: options.margin ?? 5, ...(options.bendCost === undefined ? {} : { bendCost: options.bendCost }) },
    );
    room.items.forEach(({ at }, k) => {
      const points = found[k];
      if (!points) return;
      const { edge, frame, plug } = inner[at]!;
      routes[at] = { edge: edge.id, points: plug === "source" ? points : points.reverse(), frame };
    });
  }
  return routes.filter((r): r is Route => r !== undefined);
}

/** This function puts the plug of the wall before a way that starts on the bounds. A first point on the line of the stub goes. */
function stub(plug: Point, way: Point[]): Point[] {
  const [a, b] = way;
  if (!a || dist(a, plug) === 0) return way;
  if (b && Math.abs((a.x - plug.x) * (b.y - plug.y) - (a.y - plug.y) * (b.x - plug.x)) < 1e-9 && (a.x - plug.x) * (b.x - a.x) + (a.y - plug.y) * (b.y - a.y) > 0)
    return [plug, ...way.slice(1)];
  return [plug, ...way];
}

/**
 * This function makes the room of a frame for the far ends below the nodes of `chain` (the nearest first).
 * The obstacles are the children of the frame and of each node of the chain, except the nodes of the chain.
 * Four walls close the bounds, so that no way leaves them.
 */
function makeRoom(f: Node, chain: readonly string[], children: ReadonlyMap<string, readonly Node[]>, byId: ReadonlyMap<string, Node>, inset: number, options: FrameOptions): Room {
  const margin = options.margin ?? 5;
  const bounds = shrink(f.box, inset);
  const nodes = roomNodes(f, chain, children, byId, bounds, options);
  // The band of each wall starts half a margin outside the bounds, so that a way keeps in the bounds.
  const w = shrink(bounds, -(margin / 2 + EPS));
  const t = 2 * margin + 1;
  const walls: Node[] = [
    { x: w.x - t, y: w.y - t, w: w.w + 2 * t, h: t },
    { x: w.x - t, y: w.y + w.h, w: w.w + 2 * t, h: t },
    { x: w.x - t, y: w.y, w: t, h: w.h },
    { x: w.x + w.w, y: w.y, w: t, h: w.h },
  ].map((box, i) => ({ id: `\u0000wall${i}`, box }));
  return { ways: new WayFinder([...nodes.values(), ...walls], options), nodes };
}

/**
 * This function gives the obstacles of a room by id. They are the children of the frame and of each node of the chain, but not the chain.
 * It applies the rule `outside` to each box outside the box of its holder. The rule `clamp` cuts such a box to `bounds`.
 */
function roomNodes(f: Node, chain: readonly string[], children: ReadonlyMap<string, readonly Node[]>, byId: ReadonlyMap<string, Node>, bounds: Box, options: FrameOptions): Map<string, Node> {
  const skip = new Set(chain);
  const nodes = new Map<string, Node>();
  for (const holder of [f.id, ...chain]) {
    for (const n of children.get(holder) ?? []) {
      if (skip.has(n.id)) continue;
      const box = byId.get(holder)!.box;
      if (inside(n.box, box)) {
        nodes.set(n.id, n);
        continue;
      }
      const rule = options.outside ?? "throw";
      if (rule === "throw")
        throw new RangeError(`The box of the node "${n.id}" is not inside the box of its frame "${holder}". The option outside can skip or clamp it.`);
      if (rule === "skip") continue;
      const cut = cutBox(n.box, bounds);
      if (cut) nodes.set(n.id, { ...n, box: cut, ...(n.ports ? { ports: n.ports.map((p) => (p.at ? { ...p, at: { x: p.at.x + n.box.x - cut.x, y: p.at.y + n.box.y - cut.y } } : p)) } : {}) });
    }
  }
  return nodes;
}

/** This function gives the box, smaller by `d` on each side. A negative `d` makes it larger. */
function shrink(b: Box, d: number): Box {
  return { x: b.x + d, y: b.y + d, w: Math.max(0, b.w - 2 * d), h: Math.max(0, b.h - 2 * d) };
}

/** This function tells if the box `a` is inside the box `b`. */
function inside(a: Box, b: Box): boolean {
  return a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
}

/** This function gives the part of the box `a` inside the box `b`, or `undefined` when they have no common area. */
function cutBox(a: Box, b: Box): Box | undefined {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : undefined;
}
