import {
  curveSpace,
  findStrategy,
  highwayCurves,
  laneRoutes,
  polylineLength,
  runKey,
  STRATEGIES,
  type Box,
  type CurveSegment,
  type CurveSpace,
  type Graph,
  type HighwayOptions,
  type Level,
  type Node,
  type Point,
  type Result,
  type Route,
  type Segment,
  type SegmentGraph,
} from "@mark1russell7/highways";
import { itemSizes, pickLevel, type PickOptions } from "./levels.ts";
import { endsOnOutlines, groupShapes, type GroupShape } from "./outlines.ts";

/** The three views of a bundle: each route, each shared segment one time, or the lanes pulled apart. */
export type BundleView = "expand" | "unpack" | "apart";

/** The routes that the map draws: the result of a router, its segments and its lanes pulled apart. */
export interface Routed {
  readonly result: Result;
  /** The shared and the private segments, when the result has runs or bundles. */
  readonly segments?: SegmentGraph;
  /** The routes with the lanes of each shared segment pulled apart. */
  readonly apart?: readonly Route[];
}

/** The text on a card. */
export interface CardText {
  readonly title: string;
  /** This text is the second line of the card. */
  readonly sub?: string;
  /** A strong card has the colors of a guide sign. */
  readonly strong?: boolean;
}

/** What the map shows. */
export interface Scene {
  readonly graph: Graph;
  readonly done: Routed | undefined;
  readonly bundles: BundleView;
  /** The index of a level, `levels.length` for the routes, or "auto" to follow the zoom of the camera. */
  readonly level: number | "auto";
  readonly selected: string | undefined;
  /** The curve type of the routes. The default is `straight`. The links of a level stay polylines. */
  readonly curve?: string;
  /** The options of the curve type. Without them, the curve has its defaults. */
  readonly curveOptions?: Readonly<Record<string, number | boolean | string>>;
  /**
   * The keys (`runKey`) of the open runs. With this set, the "unpack" view puts a count badge on each shared run.
   * An open run shows one lane for each edge.
   */
  readonly open?: ReadonlySet<string>;
  /** The text of each card, by node id. With it, the map draws each node as a card with a title. */
  readonly cards?: ReadonlyMap<string, CardText>;
  /** The name of the nodes in the label of a group. The default is "nodes". */
  readonly noun?: string;
  /** The thresholds that pick the level for the zoom of the camera. */
  readonly pick?: PickOptions;
  /**
   * With this pad, a group of a level has an outline at most this pad from its cards, and two outlines do not touch.
   * Its links go from outline to outline and show count badges.
   * Without it, a group is the box around its nodes.
   */
  readonly groupPad?: number;
  /** The first view of the graph: the smallest scale of a fit, and the point in the middle of the map at that scale. */
  readonly home?: { readonly minScale: number; readonly focus?: Point };
}

interface Colors {
  bg: string;
  ink: string;
  text: string;
  muted: string;
  sign: string;
  signBg: string;
  signInk: string;
  yellow: string;
  yellowInk: string;
  hi: string;
  node: string;
  nodeLine: string;
  halo: string;
  group: string;
}

/** A badge on the screen: the key of its run and its box, in pixels. */
interface Badge {
  readonly key: string;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

const MIN_SCALE = 0.02;
const MAX_SCALE = 12;
/** The distance between two lanes of an open run, in pixels on the screen. */
const LANE_PX = 5;
/** The largest width of an open run, in units of the plane. */
const LANE_MAX = 30;
/** The height of a count badge, in pixels on the screen. */
const BADGE_H = 22;

/** A canvas map of a graph and its routes, with pan, zoom and a click on a node. */
export class MapView {
  private readonly ctx: CanvasRenderingContext2D;
  private scene: Scene | undefined;
  private sizes: number[] = [];
  private colors: Colors;
  private s = 1;
  private tx = 0;
  private ty = 0;
  private w = 0;
  private h = 0;
  private frame = 0;
  private fitted = false;
  private readonly pointers = new Map<number, Point>();
  private downAt: Point | undefined;
  private moved = 0;
  private edgesOf = new Map<string, Set<string>>();
  private shownLevel = -1;
  private fade = 1;
  private placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
  private nodeById = new Map<string, Node>();
  /** The ids of the frames: the nodes that another node names as its parent. */
  private frames = new Set<string>();
  private shapes = new WeakMap<Level, Map<string, GroupShape>>();
  private badges: Badge[] = [];
  private lanes: { graph: SegmentGraph; open: ReadonlySet<string>; width: number; routes: Route[] } | undefined;
  /** The free space of the nodes of the graph, and the curve of each drawn polyline. */
  private space: CurveSpace | undefined;
  private curves = new WeakMap<readonly Point[], CurveSegment[]>();

  /**
   * @param onSelect - The view starts this function with the id of the clicked node, or `undefined` for empty space.
   * @param onLevel - The view starts this function when the shown level changes.
   * @param onRun - The view starts this function with the key of the run of a clicked count badge.
   */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onSelect: (node: string | undefined) => void,
    private readonly onLevel: (level: number) => void,
    private readonly onRun?: (key: string) => void,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot draw on a canvas.");
    this.ctx = ctx;
    this.colors = this.readColors();
    new ResizeObserver(() => this.resize()).observe(canvas);
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.restyle());
    canvas.addEventListener("pointerdown", (e) => this.down(e));
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.up(e));
    canvas.addEventListener("pointercancel", (e) => this.pointers.delete(e.pointerId));
    canvas.addEventListener("pointerleave", () => (canvas.style.cursor = ""));
    canvas.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    canvas.addEventListener("dblclick", (e) => this.zoomAt(this.local(e), 2));
    this.resize();
  }

  /** This method sets what the map shows. A new graph fits the camera to the graph. */
  set(scene: Scene): void {
    const newGraph = this.scene?.graph !== scene.graph;
    if (this.scene?.done !== scene.done) this.sizes = scene.done?.result.levels ? itemSizes(scene.done.result.levels) : [];
    if (newGraph || this.scene?.curve !== scene.curve || this.scene?.curveOptions !== scene.curveOptions) {
      this.curves = new WeakMap();
      this.lanes = undefined;
    }
    if (newGraph) {
      this.space = curveSpace(scene.graph.nodes.map((n) => n.box));
      this.nodeById = new Map(scene.graph.nodes.map((n) => [n.id, n]));
      this.frames = new Set(scene.graph.nodes.flatMap((n) => (n.parent === undefined ? [] : [n.parent])));
      // A new graph tells its level again, even when the index of the level does not change.
      this.shownLevel = -1;
      this.edgesOf = new Map();
      for (const e of scene.graph.edges)
        for (const n of [e.source.node, e.target.node]) {
          const set = this.edgesOf.get(n);
          if (set) set.add(e.id);
          else this.edgesOf.set(n, new Set([e.id]));
        }
    }
    this.scene = scene;
    if (newGraph) this.fit();
    else this.draw();
  }

  /** This method reads the colors of the theme again and draws the map. */
  restyle(): void {
    this.colors = this.readColors();
    this.draw();
  }

  /**
   * This method fits the camera to the graph. When the fit is smaller than `minScale`, the camera uses `minScale`.
   * Then it puts `focus` in the middle of the map, or the middle of the graph without a focus.
   */
  fit(minScale = this.scene?.home?.minScale ?? 0, focus = this.scene?.home?.focus): void {
    const g = this.scene?.graph;
    if (!g || g.nodes.length === 0 || this.w === 0) return;
    const b = bounds(g.nodes.map((n) => n.box));
    const pad = Math.min(40, this.w * 0.06);
    this.s = Math.min((this.w - 2 * pad) / Math.max(1, b.w), (this.h - 2 * pad) / Math.max(1, b.h));
    this.tx = (this.w - b.w * this.s) / 2 - b.x * this.s;
    this.ty = (this.h - b.h * this.s) / 2 - b.y * this.s;
    if (minScale > this.s) {
      this.s = Math.min(MAX_SCALE, minScale);
      const c = focus ?? { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      // The focus goes to the middle, but the graph stays on the whole map: no empty band where the graph is larger than the map.
      const clamp = (t: number, lo: number, size: number, view: number): number => {
        const len = size * this.s;
        if (len + 2 * pad <= view) return (view - len) / 2 - lo * this.s;
        return Math.min(pad - lo * this.s, Math.max(view - pad - (lo + size) * this.s, t));
      };
      this.tx = clamp(this.w / 2 - c.x * this.s, b.x, b.w, this.w);
      this.ty = clamp(this.h / 2 - c.y * this.s, b.y, b.h, this.h);
    }
    this.fitted = true;
    this.draw();
  }

  /** This method zooms by the factor `f` around the center of the map. */
  zoomBy(f: number): void {
    this.zoomAt({ x: this.w / 2, y: this.h / 2 }, f);
  }

  private readColors(): Colors {
    const cs = getComputedStyle(this.canvas);
    const v = (name: string): string => cs.getPropertyValue(name).trim() || "#888";
    return {
      bg: v("--map"),
      ink: v("--route"),
      text: v("--ink"),
      muted: v("--muted"),
      sign: v("--sign"),
      signBg: v("--sign-bg"),
      signInk: v("--sign-ink"),
      yellow: v("--yellow"),
      yellowInk: v("--yellow-ink"),
      hi: v("--hi"),
      node: v("--node"),
      nodeLine: v("--node-line"),
      halo: v("--map"),
      group: v("--group"),
    };
  }

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (r.width === 0 || r.height === 0) return;
    const cx = this.w ? (this.w / 2 - this.tx) / this.s : 0;
    const cy = this.h ? (this.h / 2 - this.ty) / this.s : 0;
    const had = this.w > 0;
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.fitted) this.fit();
    else if (had) {
      this.tx = this.w / 2 - cx * this.s;
      this.ty = this.h / 2 - cy * this.s;
    }
    this.draw();
  }

  private local(e: MouseEvent): Point {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private zoomAt(p: Point, f: number): void {
    const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.s * f));
    const k = s / this.s;
    this.tx = p.x - (p.x - this.tx) * k;
    this.ty = p.y - (p.y - this.ty) * k;
    this.s = s;
    this.draw();
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.zoomAt(this.local(e), Math.exp(-d * 0.0015));
  }

  private down(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, this.local(e));
    if (this.pointers.size === 1) {
      this.downAt = this.local(e);
      this.moved = 0;
    }
  }

  private move(e: PointerEvent): void {
    const old = this.pointers.get(e.pointerId);
    if (!old) {
      if (e.pointerType === "mouse") this.hover(this.local(e));
      return;
    }
    const p = this.local(e);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [Point, Point];
      const other = a === old ? b : a;
      const before = Math.hypot(old.x - other.x, old.y - other.y);
      const after = Math.hypot(p.x - other.x, p.y - other.y);
      const mid = { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 };
      this.tx += (p.x - old.x) / 2;
      this.ty += (p.y - old.y) / 2;
      if (before > 0) this.zoomAt(mid, after / before);
      this.moved += 10;
    } else {
      this.tx += p.x - old.x;
      this.ty += p.y - old.y;
      this.moved += Math.abs(p.x - old.x) + Math.abs(p.y - old.y);
      this.draw();
    }
    this.pointers.set(e.pointerId, p);
  }

  private up(e: PointerEvent): void {
    const was = this.pointers.size;
    this.pointers.delete(e.pointerId);
    if (was === 1 && this.downAt && this.moved < 6) {
      const p = this.local(e);
      const badge = this.badgeAt(p, e.pointerType === "mouse" ? 2 : 8);
      if (badge && this.onRun) this.onRun(badge.key);
      else this.onSelect(this.hit(p));
    }
    if (this.pointers.size === 0) this.downAt = undefined;
  }

  /** This method gives the badge under a point of the screen, with `slack` pixels around each badge. */
  private badgeAt(p: Point, slack: number): Badge | undefined {
    return this.badges.find((b) => p.x >= b.x0 - slack && p.x <= b.x1 + slack && p.y >= b.y0 - slack && p.y <= b.y1 + slack);
  }

  /** This method shows a hand over a badge or a card, so a visitor sees what a click does. */
  private hover(p: Point): void {
    const over = this.badgeAt(p, 2) !== undefined || (this.scene?.cards !== undefined && this.hit(p) !== undefined);
    this.canvas.style.cursor = over ? "pointer" : "";
  }

  private hit(p: Point): string | undefined {
    const g = this.scene?.graph;
    if (!g) return undefined;
    const x = (p.x - this.tx) / this.s;
    const y = (p.y - this.ty) / this.s;
    const slack = 4 / this.s;
    // The last node on top wins, so a row in a card wins over its card.
    for (const n of [...g.nodes].reverse()) {
      const b = n.box;
      if (x >= b.x - slack && x <= b.x + b.w + slack && y >= b.y - slack && y <= b.y + b.h + slack) return n.id;
    }
    return undefined;
  }

  /** This method asks for one frame. Several calls in one frame draw one time. */
  draw(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.paint();
    });
  }

  private paint(): void {
    const { ctx, colors: c } = this;
    ctx.save();
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    this.placed = [];
    this.badges = [];
    const scene = this.scene;
    if (!scene) {
      ctx.restore();
      return;
    }
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const levels = scene.done?.result.levels;
    let level = levels ? levels.length : -1;
    if (levels) level = scene.level === "auto" ? pickLevel(this.sizes, this.s, scene.pick) : Math.min(scene.level, levels.length);
    if (level !== this.shownLevel) {
      this.shownLevel = level;
      this.onLevel(level);
    }
    if (levels && level >= 0 && level < levels.length) this.paintLevel(levels[level]!, scene);
    else this.paintRoutes(scene);
    ctx.restore();
  }

  private line(points: readonly Point[], curved: boolean): void {
    const { ctx } = this;
    if (points.length < 2) return;
    const type = this.scene?.curve ?? "straight";
    const curve = curved && type !== "straight" ? findStrategy(STRATEGIES, "curve", type) : undefined;
    if (curve) {
      let segments = this.curves.get(points);
      if (!segments) {
        segments = curve.run(this.space ? { points, space: this.space } : { points }, this.scene?.curveOptions);
        this.curves.set(points, segments);
      }
      const X = (p: Point): number => p.x * this.s + this.tx;
      const Y = (p: Point): number => p.y * this.s + this.ty;
      for (const g of segments) {
        if (g.kind === "move") ctx.moveTo(X(g.to), Y(g.to));
        else if (g.kind === "line") ctx.lineTo(X(g.to), Y(g.to));
        else if (g.kind === "cubic") ctx.bezierCurveTo(X(g.c1), Y(g.c1), X(g.c2), Y(g.c2), X(g.to), Y(g.to));
        else ctx.arc(X(g.center), Y(g.center), g.radius * this.s, g.start, g.start + g.sweep, g.sweep < 0);
      }
      return;
    }
    ctx.moveTo(points[0]!.x * this.s + this.tx, points[0]!.y * this.s + this.ty);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x * this.s + this.tx, points[i]!.y * this.s + this.ty);
  }

  private strokeAll(lines: readonly (readonly Point[])[], color: string, width: number, alpha: number, curved = true): void {
    const { ctx } = this;
    ctx.globalAlpha = alpha * this.fade;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const p of lines) this.line(p, curved);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private fat(count: number): number {
    return Math.min(14, 1 + 1.15 * Math.sqrt(count)) * Math.min(1.6, Math.max(0.7, Math.sqrt(this.s * 1.4)));
  }

  private thin(): number {
    return Math.min(1.8, Math.max(0.7, this.s * 1.2));
  }

  private paintRoutes(scene: Scene): void {
    const { colors: c } = this;
    const done = scene.done;
    // A selected card fades the other routes of a board of cards.
    this.fade = scene.selected && scene.cards ? 0.3 : 1;
    let drawn: readonly Route[] | undefined = done?.result.routes;
    if (done) {
      const segments = done.segments;
      if (scene.bundles === "unpack" && segments && scene.open) drawn = this.paintRuns(segments, scene.open);
      else if (scene.bundles === "unpack" && segments) {
        const single = segments.segments.filter((s) => s.count < 2);
        const shared = segments.segments.filter((s) => s.count >= 2).sort((a, b) => a.count - b.count);
        this.strokeAll(
          single.map((s) => s.points),
          c.ink,
          this.thin(),
          0.5,
        );
        for (const s of shared) this.strokeAll([s.points], c.sign, this.fat(s.count), 0.9);
        this.labels(shared.filter((s) => s.count >= 3));
      } else if (scene.bundles === "apart" && done.apart) {
        drawn = done.apart;
        this.strokeAll(
          done.apart.map((r) => r.points),
          c.sign,
          Math.max(0.6, this.thin() * 0.8),
          0.75,
        );
      } else {
        this.strokeAll(
          done.result.routes.map((r) => r.points),
          c.ink,
          this.thin(),
          0.5,
        );
      }
    }
    this.fade = 1;
    this.paintNodeIds(
      scene,
      scene.graph.nodes.map((n) => n.id),
    );
    // The inner routes of a frame are inside its card, so they go on top of the cards. On a strong card, they take the ink of the sign.
    const innerRoutes = done?.result.routes.filter((r) => r.frame !== undefined) ?? [];
    if (innerRoutes.length > 0) {
      this.fade = scene.selected && scene.cards ? 0.3 : 1;
      for (const strong of [false, true])
        this.strokeAll(
          innerRoutes.filter((r) => Boolean(scene.cards?.get(r.frame!)?.strong) === strong).map((r) => r.points),
          strong ? c.signInk : c.ink,
          this.thin(),
          0.8,
        );
      this.fade = 1;
    }
    if (scene.selected && drawn) {
      const ids = this.edgesOf.get(scene.selected) ?? new Set<string>();
      const routes = drawn.filter((r) => ids.has(r.edge));
      this.strokeAll(
        routes.map((r) => r.points),
        c.halo,
        4.5,
        0.9,
      );
      this.strokeAll(
        routes.map((r) => r.points),
        c.hi,
        2.2,
        1,
      );
      const node = this.nodeById.get(scene.selected);
      if (node) this.outline(node.box, c.hi, 2.5);
    }
    if (done?.segments && scene.open && scene.bundles === "unpack") this.paintBadges(done.segments, scene.open);
  }

  /**
   * This method draws the runs of a board: a closed run is one fat line, and an open run has one lane for each edge.
   * It gives the route of each edge, with a lane for each edge of an open shared segment.
   */
  private paintRuns(graph: SegmentGraph, open: ReadonlySet<string>): readonly Route[] {
    const { colors: c } = this;
    // The lanes keep LANE_PX on the screen. The width changes in steps, so a zoom does not compute the lanes at each frame.
    const width = LANE_PX / 2 ** (Math.round(Math.log2(this.s) * 8) / 8);
    if (!this.lanes || this.lanes.graph !== graph || this.lanes.open !== open || this.lanes.width !== width)
      this.lanes = { graph, open, width, routes: laneRoutes(graph, open, width, LANE_MAX) };
    // The curve `highway` bends the lanes of a bundle as one. So it gives the curves of all the lanes together.
    const first = this.lanes.routes[0];
    if (this.scene?.curve === "highway" && first && !this.curves.has(first.points)) {
      const curves = highwayCurves(graph, open, width, { ...(this.scene?.curveOptions as HighwayOptions | undefined), maxWidth: LANE_MAX, ...(this.space ? { space: this.space } : {}) });
      this.lanes.routes.forEach((r, i) => this.curves.set(r.points, curves[i]!.segments));
    }
    const inOpen = new Set<string>();
    for (const s of graph.segments) if (s.count >= 2 && open.has(runKey(s.edges))) for (const e of s.edges) inOpen.add(e);
    const single = graph.segments.filter((s) => s.count < 2 && !inOpen.has(s.edges[0]!));
    const closed = graph.segments.filter((s) => s.count >= 2 && !open.has(runKey(s.edges))).sort((a, b) => a.count - b.count);
    this.strokeAll(
      single.map((s) => s.points),
      c.ink,
      this.thin(),
      0.55,
    );
    for (const s of closed) this.strokeAll([s.points], c.sign, this.fat(s.count), 0.9);
    const lanes = this.lanes.routes.filter((r) => inOpen.has(r.edge)).map((r) => r.points);
    // The narrowest space between two lanes on the screen sets the width of the lines, so the lanes stay apart.
    let space = LANE_PX;
    for (const s of graph.segments) if (s.count >= 2 && open.has(runKey(s.edges))) space = Math.min(space, Math.min(width, LANE_MAX / (s.count - 1)) * this.s);
    const line = Math.max(0.8, Math.min(1.8, space * 0.5));
    if (space >= 4) this.strokeAll(lanes, c.halo, line + 2, 0.85);
    this.strokeAll(lanes, c.sign, line, 1);
    return this.lanes.routes;
  }

  /** This method draws a count badge on each shared run that is long enough on the screen. A badge keeps its size at each zoom. */
  private paintBadges(graph: SegmentGraph, open: ReadonlySet<string>): void {
    // Two segments with the same edges are one run. Its badge goes on its longest segment.
    const runs = new Map<string, { s: Segment; len: number }>();
    for (const s of graph.segments) {
      if (s.count < 2) continue;
      const key = runKey(s.edges);
      const len = polylineLength(s.points);
      const had = runs.get(key);
      if (!had || len > had.len) runs.set(key, { s, len });
    }
    const list = [...runs].sort((a, b) => Number(open.has(b[0])) - Number(open.has(a[0])) || b[1].s.count - a[1].s.count);
    for (const [key, { s, len }] of list) {
      const isOpen = open.has(key);
      if (!isOpen && len * this.s < 36) continue;
      const p = midpoint(s.points);
      if (!p) continue;
      const box = this.pill(p.x * this.s + this.tx, p.y * this.s + this.ty, String(s.count), isOpen);
      if (box) this.badges.push({ key, ...box });
    }
  }

  /**
   * This method draws a count badge, centered on (x, y) on the screen: green like a guide sign, or yellow when `lit`.
   * It gives the box of the badge, or `undefined` when the badge is off the screen or hits a label already drawn.
   */
  private pill(x: number, y: number, text: string, lit: boolean): { x0: number; y0: number; x1: number; y1: number } | undefined {
    const { ctx, colors: c } = this;
    ctx.font = "800 12px Overpass, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = Math.max(BADGE_H + 2, ctx.measureText(text).width + 14);
    if (x < -w || y < -BADGE_H || x > this.w + w || y > this.h + BADGE_H) return undefined;
    if (!this.room(x, y, w + 4, BADGE_H + 4)) return undefined;
    const box = { x0: x - w / 2, y0: y - BADGE_H / 2, x1: x + w / 2, y1: y + BADGE_H / 2 };
    ctx.beginPath();
    ctx.roundRect(box.x0, box.y0, w, BADGE_H, 6);
    ctx.fillStyle = lit ? c.yellow : c.signBg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = lit ? c.yellowInk : c.signInk;
    ctx.beginPath();
    ctx.roundRect(box.x0 + 2.5, box.y0 + 2.5, w - 5, BADGE_H - 5, 4);
    ctx.stroke();
    ctx.fillStyle = lit ? c.yellowInk : c.signInk;
    ctx.fillText(text, x, y + 1);
    return box;
  }

  /** This method draws the nodes with these ids: as cards with a title when the scene has cards, else as plain boxes. */
  private paintNodeIds(scene: Scene, ids: readonly string[]): void {
    const nodes = ids.map((id) => this.nodeById.get(id)).filter((n): n is Node => n !== undefined);
    // A frame goes under the nodes in it: the nodes of each depth go on top of the nodes of the depth before.
    for (const layer of depthLayers(nodes, this.nodeById)) {
      if (scene.cards) this.paintCards(layer, scene.cards);
      else this.paintNodes(layer.map((n) => n.box));
    }
  }

  /** This method draws each node as a card. A card that is large enough on the screen shows its title and its second line. */
  private paintCards(nodes: readonly Node[], cards: ReadonlyMap<string, CardText>): void {
    const { ctx, colors: c } = this;
    const screen = (b: Box): Box => ({ x: b.x * this.s + this.tx, y: b.y * this.s + this.ty, w: b.w * this.s, h: b.h * this.s });
    const visible = nodes
      .map((n) => ({ b: screen(n.box), card: cards.get(n.id), frame: this.frames.has(n.id) }))
      .filter(({ b }) => b.x + b.w >= 0 && b.y + b.h >= 0 && b.x <= this.w && b.y <= this.h);
    for (const strong of [false, true]) {
      ctx.beginPath();
      for (const { b, card } of visible) {
        if (Boolean(card?.strong) !== strong) continue;
        ctx.roundRect(b.x, b.y, b.w, b.h, Math.min(7, b.h * 0.16));
      }
      ctx.fillStyle = strong ? c.signBg : c.node;
      ctx.fill();
      if (visible[0] && visible[0].b.w > 6) {
        ctx.lineWidth = strong ? 1.5 : 1;
        ctx.strokeStyle = strong ? c.signInk : c.nodeLine;
        ctx.stroke();
      }
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (const { b, card, frame } of visible) {
      if (!card || b.w < 44 || b.h < 14) continue;
      const pad = Math.min(10, b.w * 0.08);
      const size = Math.max(9, Math.min(15, b.h * 0.3));
      const two = !frame && card.sub !== undefined && b.h >= 34;
      ctx.font = `800 ${size}px Overpass, system-ui, sans-serif`;
      ctx.fillStyle = card.strong ? c.signInk : c.text;
      // The title of a frame goes in the band above the nodes in it.
      const ty = frame ? b.y + Math.min(b.h / 2, 18 * this.s) : two ? b.y + b.h * 0.36 : b.y + b.h / 2;
      ctx.fillText(fitText(ctx, card.title, b.w - 2 * pad), b.x + pad, ty + 1);
      if (two) {
        ctx.font = `600 ${Math.max(8.5, size * 0.78)}px Overpass, system-ui, sans-serif`;
        ctx.fillStyle = card.strong ? c.signInk : c.muted;
        ctx.globalAlpha = card.strong ? 0.85 : 1;
        ctx.fillText(fitText(ctx, card.sub!, b.w - 2 * pad), b.x + pad, b.y + b.h * 0.7 + 1);
        ctx.globalAlpha = 1;
      }
    }
  }

  private paintNodes(boxes: readonly Box[]): void {
    const { ctx, colors: c } = this;
    ctx.fillStyle = c.node;
    ctx.strokeStyle = c.nodeLine;
    ctx.lineWidth = 1;
    const tiny = boxes.length > 0 && boxes[0]!.w * this.s < 4;
    ctx.beginPath();
    for (const b of boxes) ctx.rect(b.x * this.s + this.tx, b.y * this.s + this.ty, b.w * this.s, b.h * this.s);
    ctx.fill();
    if (!tiny) ctx.stroke();
  }

  private outline(b: Box, color: string, width: number): void {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(b.x * this.s + this.tx - 2, b.y * this.s + this.ty - 2, b.w * this.s + 4, b.h * this.s + 4);
  }

  private labels(items: readonly { points: readonly Point[]; count: number }[]): void {
    const { ctx, colors: c } = this;
    ctx.font = "700 11px Overpass, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = c.halo;
    ctx.fillStyle = c.sign;
    for (const it of [...items].sort((a, b) => b.count - a.count)) {
      const p = midpoint(it.points);
      if (!p || polylineLength(it.points) * this.s < 56) continue;
      const x = p.x * this.s + this.tx;
      const y = p.y * this.s + this.ty;
      if (x < 0 || y < 0 || x > this.w || y > this.h) continue;
      if (!this.room(x, y, 8 + 7 * String(it.count).length, 16)) continue;
      ctx.strokeText(String(it.count), x, y);
      ctx.fillText(String(it.count), x, y);
    }
  }

  /** This method reserves a box for a label, centered on (x, y). It gives false when the box hits a label already drawn. */
  private room(x: number, y: number, w: number, h: number): boolean {
    const r = { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 };
    for (const o of this.placed) if (r.x0 < o.x1 && o.x0 < r.x1 && r.y0 < o.y1 && o.y0 < r.y1) return false;
    this.placed.push(r);
    return true;
  }

  /**
   * This method draws a level with an outline around each group, at most `pad` from its cards.
   * Each link goes from outline to outline.
   */
  private paintOutlines(level: Level, scene: Scene, pad: number): void {
    const { ctx, colors: c } = this;
    const groups = level.items.filter((i) => i.nodes.length > 1);
    const singles = level.items.filter((i) => i.nodes.length === 1);
    const boxesOf = (ids: readonly string[]): Box[] =>
      ids.map((id) => this.nodeById.get(id)?.box).filter((b): b is Box => b !== undefined);
    let shapes = this.shapes.get(level);
    if (!shapes) {
      shapes = groupShapes(level, (id) => this.nodeById.get(id)?.box, pad);
      this.shapes.set(level, shapes);
    }
    for (const g of groups) {
      const shape = shapes.get(g.id);
      if (!shape) continue;
      this.roundedPath(shape.outline, Math.min(14, Math.max(5, (shape.pad + 10) * this.s)));
      ctx.fillStyle = c.bg;
      ctx.fill();
      ctx.fillStyle = c.group;
      ctx.fill();
      ctx.lineWidth = 1.75;
      ctx.lineJoin = "round";
      ctx.strokeStyle = c.sign;
      ctx.stroke();
    }
    const links = [...level.links]
      .sort((a, b) => a.count - b.count)
      .map((l) => ({ ...l, points: endsOnOutlines(l.points, shapes.get(l.source), shapes.get(l.target)) }));
    for (const l of links) this.strokeAll([l.points], c.sign, this.fat(l.count), 0.85, false);
    this.paintNodeIds(
      scene,
      singles.map((i) => i.nodes[0]!),
    );
    ctx.font = "900 14px Overpass, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const g of groups) {
      // The label goes in the middle of a rectangle. In another outline, it goes on the card nearest to the middle of the group.
      const mid = { x: g.box.x + g.box.w / 2, y: g.box.y + g.box.h / 2 };
      let at = mid;
      let best = Infinity;
      const square = (shapes.get(g.id)?.outline.length ?? 0) === 4;
      for (const b of square ? [] : boxesOf(g.nodes)) {
        const q = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        const d = Math.hypot(q.x - mid.x, q.y - mid.y);
        if (d < best) [best, at] = [d, q];
      }
      const text = `${g.nodes.length} ${scene.noun ?? "nodes"}`;
      const x = at.x * this.s + this.tx;
      const y = at.y * this.s + this.ty;
      if (!this.room(x, y, ctx.measureText(text).width + 8, 18)) continue;
      ctx.lineWidth = 4;
      ctx.strokeStyle = c.bg;
      ctx.strokeText(text, x, y + 1);
      ctx.fillStyle = c.sign;
      ctx.fillText(text, x, y + 1);
      ctx.font = "900 14px Overpass, system-ui, sans-serif";
    }
    for (const l of [...links].reverse()) {
      if (l.count < 2 || polylineLength(l.points) * this.s < 30) continue;
      const p = midpoint(l.points);
      if (p) this.pill(p.x * this.s + this.tx, p.y * this.s + this.ty, String(l.count), false);
      ctx.font = "900 14px Overpass, system-ui, sans-serif";
    }
    if (scene.selected) {
      const item = level.items.find((i) => i.nodes.includes(scene.selected!));
      if (item) this.outline(item.box, c.hi, 2.5);
    }
  }

  /** This method starts a closed path through the points, in world units, with corners rounded by `r` pixels at most. */
  private roundedPath(points: readonly Point[], r: number): void {
    const { ctx } = this;
    const p = points.map((q) => ({ x: q.x * this.s + this.tx, y: q.y * this.s + this.ty }));
    const n = p.length;
    ctx.beginPath();
    if (n < 3) return;
    const half = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y) / 2;
    const first = p[n - 1]!;
    ctx.moveTo((first.x + p[0]!.x) / 2, (first.y + p[0]!.y) / 2);
    for (let i = 0; i < n; i++) {
      const a = p[(i + n - 1) % n]!;
      const b = p[i]!;
      const next = p[(i + 1) % n]!;
      ctx.arcTo(b.x, b.y, next.x, next.y, Math.min(r, half(a, b), half(b, next)));
    }
    ctx.closePath();
  }

  private paintLevel(level: Level, scene: Scene): void {
    const { ctx, colors: c } = this;
    const groups = level.items.filter((i) => i.nodes.length > 1);
    const singles = level.items.filter((i) => i.nodes.length === 1);
    if (scene.groupPad !== undefined) {
      this.paintOutlines(level, scene, scene.groupPad);
      return;
    }
    for (const g of groups) {
      const b = g.box;
      const r = Math.min(10, b.w * this.s * 0.1);
      ctx.beginPath();
      ctx.roundRect(b.x * this.s + this.tx, b.y * this.s + this.ty, b.w * this.s, b.h * this.s, r);
      ctx.fillStyle = c.group;
      ctx.fill();
      ctx.strokeStyle = c.sign;
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
    const links = [...level.links].sort((a, b) => a.count - b.count);
    for (const l of links) this.strokeAll([l.points], c.sign, this.fat(l.count), 0.85, false);
    if (scene.cards)
      this.paintNodeIds(
        scene,
        singles.map((i) => i.nodes[0]!),
      );
    else this.paintNodes(singles.map((i) => i.box));
    ctx.font = "800 13px Overpass, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = c.sign;
    for (const g of groups) {
      const b = g.box;
      if (b.w * this.s < 40 || b.h * this.s < 24) continue;
      const text = `${g.nodes.length} ${scene.noun ?? "nodes"}`;
      const x = (b.x + b.w / 2) * this.s + this.tx;
      const y = b.y * this.s + this.ty + 12;
      if (!this.room(x, y, ctx.measureText(text).width + 6, 16)) continue;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = c.halo;
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
    }
    this.labels(links.filter((l) => l.count >= 3));
    if (scene.selected) {
      const item = level.items.find((i) => i.nodes.includes(scene.selected!));
      if (item) this.outline(item.box, c.hi, 2.5);
    }
  }
}

/** This function puts the nodes in layers by their depth of frames. A node without a parent has the depth 0. One layer keeps the order of the nodes. */
function depthLayers(nodes: readonly Node[], byId: ReadonlyMap<string, Node>): Node[][] {
  if (!nodes.some((n) => n.parent !== undefined)) return [[...nodes]];
  const layers: Node[][] = [];
  for (const n of nodes) {
    let depth = 0;
    for (let p = n.parent; p !== undefined && depth < byId.size; p = byId.get(p)?.parent) depth++;
    (layers[depth] ??= []).push(n);
  }
  return layers.filter((l) => l !== undefined);
}

function bounds(boxes: readonly Box[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}


/** This function gives the text, cut with an ellipsis when it is wider than `max` pixels in the font of the context. */
function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid).trimEnd()}…`).width <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${text.slice(0, lo).trimEnd()}…` : "";
}

/** This function gives the point halfway along a polyline. */
function midpoint(p: readonly Point[]): Point | undefined {
  if (p.length < 2) return p[0];
  let left = polylineLength(p) / 2;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!;
    const b = p[i]!;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d >= left && d > 0) return { x: a.x + ((b.x - a.x) * left) / d, y: a.y + ((b.y - a.y) * left) / d };
    left -= d;
  }
  return p[p.length - 1];
}
