import { polylineLength, type Box, type Graph, type Level, type Point, type Route } from "@highways/core";
import { itemSizes, pickLevel } from "./levels.ts";
import type { RouteDone } from "./protocol.ts";

/** The three views of a bundle: each route, each shared segment one time, or the lanes pulled apart. */
export type BundleView = "expand" | "unpack" | "apart";

/** What the map shows. */
export interface Scene {
  readonly graph: Graph;
  readonly done: RouteDone | undefined;
  readonly bundles: BundleView;
  /** The index of a level, `levels.length` for the routes, or "auto" to follow the zoom of the camera. */
  readonly level: number | "auto";
  readonly selected: string | undefined;
}

interface Colors {
  bg: string;
  ink: string;
  sign: string;
  hi: string;
  node: string;
  nodeLine: string;
  halo: string;
  group: string;
}

const MIN_SCALE = 0.02;
const MAX_SCALE = 12;

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
  private placed: { x0: number; y0: number; x1: number; y1: number }[] = [];

  /**
   * @param onSelect - The view starts this function with the id of the clicked node, or `undefined` for empty space.
   * @param onLevel - The view starts this function when the shown level changes.
   */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onSelect: (node: string | undefined) => void,
    private readonly onLevel: (level: number) => void,
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
    canvas.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    canvas.addEventListener("dblclick", (e) => this.zoomAt(this.local(e), 2));
    this.resize();
  }

  /** This method sets what the map shows. A new graph fits the camera to the graph. */
  set(scene: Scene): void {
    const newGraph = this.scene?.graph !== scene.graph;
    if (this.scene?.done !== scene.done) this.sizes = scene.done?.result.levels ? itemSizes(scene.done.result.levels) : [];
    if (newGraph) {
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

  /** This method fits the camera to the graph. */
  fit(): void {
    const g = this.scene?.graph;
    if (!g || g.nodes.length === 0 || this.w === 0) return;
    const b = bounds(g.nodes.map((n) => n.box));
    const pad = Math.min(40, this.w * 0.06);
    this.s = Math.min((this.w - 2 * pad) / Math.max(1, b.w), (this.h - 2 * pad) / Math.max(1, b.h));
    this.tx = (this.w - b.w * this.s) / 2 - b.x * this.s;
    this.ty = (this.h - b.h * this.s) / 2 - b.y * this.s;
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
      sign: v("--sign"),
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
    if (!old) return;
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
    if (was === 1 && this.downAt && this.moved < 6) this.onSelect(this.hit(this.local(e)));
    if (this.pointers.size === 0) this.downAt = undefined;
  }

  private hit(p: Point): string | undefined {
    const g = this.scene?.graph;
    if (!g) return undefined;
    const x = (p.x - this.tx) / this.s;
    const y = (p.y - this.ty) / this.s;
    const slack = 4 / this.s;
    for (const n of g.nodes) {
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
    const scene = this.scene;
    if (!scene) {
      ctx.restore();
      return;
    }
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const levels = scene.done?.result.levels;
    let level = levels ? levels.length : -1;
    if (levels) level = scene.level === "auto" ? pickLevel(this.sizes, this.s) : Math.min(scene.level, levels.length);
    if (level !== this.shownLevel) {
      this.shownLevel = level;
      this.onLevel(level);
    }
    if (levels && level >= 0 && level < levels.length) this.paintLevel(levels[level]!, scene);
    else this.paintRoutes(scene);
    ctx.restore();
  }

  private line(points: readonly Point[]): void {
    const { ctx } = this;
    if (points.length < 2) return;
    ctx.moveTo(points[0]!.x * this.s + this.tx, points[0]!.y * this.s + this.ty);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i]!.x * this.s + this.tx, points[i]!.y * this.s + this.ty);
  }

  private strokeAll(lines: readonly (readonly Point[])[], color: string, width: number, alpha: number): void {
    const { ctx } = this;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const p of lines) this.line(p);
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
    if (done) {
      const segments = done.segments;
      if (scene.bundles === "unpack" && segments) {
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
    this.paintNodes(scene.graph.nodes.map((n) => n.box));
    if (scene.selected && done) {
      const ids = this.edgesOf.get(scene.selected) ?? new Set<string>();
      const routes: Route[] =
        scene.bundles === "apart" && done.apart ? done.apart.filter((r) => ids.has(r.edge)) : done.result.routes.filter((r) => ids.has(r.edge));
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
      const node = scene.graph.nodes.find((n) => n.id === scene.selected);
      if (node) this.outline(node.box, c.hi, 2.5);
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

  private paintLevel(level: Level, scene: Scene): void {
    const { ctx, colors: c } = this;
    const groups = level.items.filter((i) => i.nodes.length > 1);
    const singles = level.items.filter((i) => i.nodes.length === 1);
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
    for (const l of links) this.strokeAll([l.points], c.sign, this.fat(l.count), 0.85);
    this.paintNodes(singles.map((i) => i.box));
    ctx.font = "800 13px Overpass, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = c.sign;
    for (const g of groups) {
      const b = g.box;
      if (b.w * this.s < 40 || b.h * this.s < 24) continue;
      const text = `${g.nodes.length} nodes`;
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
