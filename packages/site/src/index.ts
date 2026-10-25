import { FIXTURES, makeFixture, ROUTERS, type BenchRow, type Graph } from "@highways/core";
import benchText from "../content/bench.md?raw";
import demoText from "../content/demo.md?raw";
import levelsText from "../content/levels.md?raw";
import noBenchText from "../content/nobench.md?raw";
import readme from "../../../README.md?raw";
import { html, inline, README, sectionOf } from "./content.ts";
import type { RouteDone, RouteReply, RouteRequest } from "./protocol.ts";
import "./style.css";
import { MapView, type BundleView } from "./view.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element "${id}".`);
  return el as T;
};

// The fixtures of the demo: all fixtures that a browser routes in a few seconds.
const DEMO_FIXTURES = FIXTURES.filter((f) => f.nodes <= 1000);
const START = { fixture: "small-clustered", router: "shared" };
const fmt = new Intl.NumberFormat("en-US");

/** This function escapes text for HTML. */
const esc = (text: string): string =>
  text.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[ch]!);

interface State {
  fixture: string;
  router: string;
  bundles: BundleView;
  level: number;
  follow: boolean;
  selected: string | undefined;
}

const state: State = { fixture: START.fixture, router: START.router, bundles: "unpack", level: -1, follow: true, selected: undefined };

// The worker routes one request at a time. A request of the visitor goes before the requests that fill the cache.
const worker = new Worker(new URL("./route.worker.ts", import.meta.url), { type: "module" });
const cache = new Map<string, Promise<RouteReply>>();
const waiting: { req: RouteRequest; resolve: (r: RouteReply) => void; urgent: boolean }[] = [];
const replies = new Map<number, (r: RouteReply) => void>();
let busy = false;
let nextId = 1;

worker.addEventListener("message", (e: MessageEvent<RouteReply>) => {
  replies.get(e.data.id)?.(e.data);
  replies.delete(e.data.id);
  busy = false;
  pump();
});

function pump(): void {
  if (busy) return;
  const job = waiting.shift();
  if (!job) return;
  busy = true;
  replies.set(job.req.id, job.resolve);
  worker.postMessage(job.req);
}

function route(fixture: string, router: string, urgent: boolean): Promise<RouteReply> {
  const key = `${fixture}|${router}`;
  const hit = cache.get(key);
  if (hit) {
    // A wanted route moves to the front of the queue.
    if (urgent) {
      const i = waiting.findIndex((w) => w.req.fixture === fixture && w.req.router === router);
      if (i > 0) waiting.unshift(...waiting.splice(i, 1));
    }
    return hit;
  }
  const p = new Promise<RouteReply>((resolve) => {
    const job = { req: { id: nextId++, fixture, router }, resolve, urgent };
    if (urgent) waiting.unshift(job);
    else waiting.push(job);
  });
  cache.set(key, p);
  pump();
  return p;
}

const graphs = new Map<string, Graph>();
function graphOf(name: string): Graph {
  let g = graphs.get(name);
  if (!g) {
    g = makeFixture(DEMO_FIXTURES.find((f) => f.name === name)!);
    graphs.set(name, g);
  }
  return g;
}

// The parts of the page.
const view = new MapView(
  $("map"),
  (node) => {
    state.selected = node === state.selected ? undefined : node;
    render();
  },
  (level) => showLevel(level),
);

$("tagline").innerHTML = inline("Edge routing for large graphs, with a hierarchy of highways, bundles and zoom levels.");
$("demo-help").innerHTML = html(demoText);
$("idea-body").innerHTML = html(README.idea);
$("segments-body").innerHTML = html(README.segments);
$("routers-body").innerHTML = html(README.routers);

const routerRow = $("routers");
for (const r of ROUTERS) {
  const b = document.createElement("button");
  b.type = "button";
  b.role = "radio";
  b.className = "exit";
  b.dataset["router"] = r.name;
  b.textContent = r.name;
  b.addEventListener("click", () => pickRouter(r.name));
  routerRow.append(b);
}
routerRow.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const i = ROUTERS.findIndex((r) => r.name === state.router);
  const j = (i + (e.key === "ArrowRight" ? 1 : ROUTERS.length - 1)) % ROUTERS.length;
  pickRouter(ROUTERS[j]!.name);
  routerRow.querySelector<HTMLButtonElement>(`[data-router="${ROUTERS[j]!.name}"]`)?.focus();
  e.preventDefault();
});

// A router name in the table of routers picks that router on the map.
for (const code of $("routers-body").querySelectorAll("td:first-child code")) {
  const name = code.textContent ?? "";
  if (!ROUTERS.some((r) => r.name === name)) continue;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "table-pick";
  b.title = `Show ${name} on the map`;
  b.append(code.cloneNode(true));
  b.addEventListener("click", () => {
    pickRouter(name);
    $("map").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  });
  code.replaceWith(b);
}

const fixtureSelect = $<HTMLSelectElement>("fixture");
for (const f of DEMO_FIXTURES) {
  const o = document.createElement("option");
  o.value = f.name;
  o.textContent = `${f.name} (${fmt.format(f.nodes)} nodes)`;
  fixtureSelect.append(o);
}
fixtureSelect.value = state.fixture;
fixtureSelect.addEventListener("change", () => {
  state.fixture = fixtureSelect.value;
  state.selected = undefined;
  update();
});

for (const input of document.querySelectorAll<HTMLInputElement>('input[name="bundles"]'))
  input.addEventListener("change", () => {
    if (input.checked) state.bundles = input.value as BundleView;
    render();
  });

const levelInput = $<HTMLInputElement>("level");
const follow = $<HTMLInputElement>("follow");
levelInput.addEventListener("input", () => {
  state.level = Number(levelInput.value);
  state.follow = false;
  follow.checked = false;
  render();
});
follow.addEventListener("change", () => {
  state.follow = follow.checked;
  render();
});
$("zoom-in").addEventListener("click", () => view.zoomBy(1.6));
$("zoom-out").addEventListener("click", () => view.zoomBy(1 / 1.6));
$("zoom-fit").addEventListener("click", () => view.fit());
$("level-field").insertAdjacentHTML("beforeend", `<div class="hint">${html(levelsText)}</div>`);

let current: RouteDone | undefined;
let control: RouteDone | undefined;
let ticket = 0;

function pickRouter(name: string): void {
  // Only the name of a router of the core goes into the state.
  const router = ROUTERS.find((r) => r.name === name);
  if (!router) return;
  state.router = router.name;
  update();
}

/** This function routes the chosen fixture with the chosen router, then draws the result. */
async function update(): Promise<void> {
  const mine = ++ticket;
  const graph = graphOf(state.fixture);
  for (const b of routerRow.querySelectorAll<HTMLButtonElement>(".exit")) {
    const on = b.dataset["router"] === state.router;
    b.setAttribute("aria-checked", String(on));
    b.tabIndex = on ? 0 : -1;
    // On a phone, the row scrolls so that the chosen router is in view.
    const x = b.offsetLeft - routerRow.offsetLeft;
    if (on && (x < routerRow.scrollLeft || x + b.offsetWidth > routerRow.scrollLeft + routerRow.clientWidth)) routerRow.scrollLeft = x - 8;
  }
  const method = $("method");
  const title = document.createElement("strong");
  title.textContent = state.router;
  method.replaceChildren(title);
  method.insertAdjacentHTML("beforeend", inline(README.methods.get(state.router) ?? ""));
  const status = $("status");
  status.textContent = `Routing ${fmt.format(graph.edges.length)} edges with ${state.router}…`;
  status.hidden = false;
  current = undefined;
  render();
  const [reply, straight] = await Promise.all([route(state.fixture, state.router, true), route(state.fixture, "straight", true)]);
  if (mine !== ticket) return;
  if (!reply.ok) {
    status.textContent = `The router failed: ${reply.error}`;
    return;
  }
  status.hidden = true;
  current = reply;
  control = straight.ok ? straight : undefined;
  const levels = reply.result.levels;
  if (levels) {
    levelInput.max = String(levels.length);
    if (state.level < 0 || state.level > levels.length) state.level = levels.length;
  }
  render();
  prefetch(graph);
}

/** This function routes the other routers of a small fixture in the background, so that a change of router is fast. */
function prefetch(graph: Graph): void {
  if (graph.nodes.length > 400) return;
  for (const r of ROUTERS) void route(state.fixture, r.name, false);
}

function render(): void {
  const graph = graphOf(state.fixture);
  const done = current;
  const shared = done?.segments !== undefined;
  const levels = done?.result.levels;
  $("bundle-field").classList.toggle("off", !shared);
  for (const i of document.querySelectorAll<HTMLInputElement>('input[name="bundles"]')) i.disabled = !shared;
  $("bundle-hint").textContent = shared
    ? `${fmt.format(done.segments!.segments.filter((s) => s.count > 1).length)} shared segments carry the edges.`
    : "This router gives no shared segments. Each edge has its own route.";
  $("level-field").classList.toggle("off", !levels);
  levelInput.disabled = !levels;
  follow.disabled = !levels;
  if (levels && !state.follow) levelInput.value = String(state.level);
  view.set({ graph, done, bundles: state.bundles, level: state.follow ? "auto" : state.level, selected: state.selected });
  if (!levels) {
    $("level-name").textContent = "This router gives no zoom levels.";
    $("level-badge").hidden = true;
  }
  stats(graph, done);
}

function showLevel(level: number): void {
  const levels = current?.result.levels;
  const badge = $("level-badge");
  if (!levels) return;
  if (state.follow) levelInput.value = String(level);
  const text =
    level >= levels.length
      ? "Each edge"
      : `Level ${level}: ${fmt.format(levels[level]!.items.length)} items, ${fmt.format(levels[level]!.links.length)} links`;
  $("level-name").textContent = text;
  badge.textContent = text;
  badge.hidden = false;
}

function delta(value: number, base: number | undefined, unit: string, fewer = "less"): string {
  if (base === undefined || base === 0 || state.router === "straight") return "";
  const p = Math.round((1 - value / base) * 100);
  if (p === 0) return `<span class="delta">the same as straight lines</span>`;
  return `<span class="delta ${p > 0 ? "good" : "bad"}">${Math.abs(p)}% ${p > 0 ? fewer : "more"} ${unit} than straight lines</span>`;
}

function stats(graph: Graph, done: RouteDone | undefined): void {
  const dl = $("stats");
  if (!done) {
    dl.innerHTML = "";
    return;
  }
  const q = done.quality;
  const c = control?.quality;
  const rows: [string, string][] = [
    ["Size", `${fmt.format(graph.nodes.length)} nodes, ${fmt.format(graph.edges.length)} edges`],
    ["Time", `${done.ms < 10 ? done.ms.toFixed(1) : fmt.format(Math.round(done.ms))} ms on this device`],
    ["Ink", `${fmt.format(Math.round(q.ink))} ${delta(q.ink, c?.ink, "ink")}`],
    ["Crossings", `${q.crossingsEstimated ? "≈" : ""}${fmt.format(q.crossings)} ${delta(q.crossings, c?.crossings, "crossings", "fewer")}`],
    ["Bends", `${q.bends.toFixed(1)} for each route`],
    ["Detour", `${q.detour.toFixed(2)} times the line between the plugs`],
    ["Broken rules", done.violations === 0 ? `<span class="ok">0</span>` : `<span class="bad">${fmt.format(done.violations)}</span>`],
  ];
  if (state.selected) {
    const n = graph.edges.filter((e) => e.source.node === state.selected || e.target.node === state.selected).length;
    rows.push(["Selected", `${esc(state.selected)}, ${n} edges <button type="button" class="link" id="clear">Clear</button>`]);
  }
  dl.innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  document.getElementById("clear")?.addEventListener("click", () => {
    state.selected = undefined;
    render();
  });
}

// The road: the steps of the status table of the README.
function road(): void {
  const rows = sectionOf(readme, "Status")
    .split(/\r?\n/)
    .map((l) => /^\|\s*(H\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null);
  $("road").innerHTML = rows
    .map(([, step, content, st]) => {
      const cls = st === "Done" ? "done" : st === "In progress" ? "now" : "later";
      return `<li class="${cls}"><span class="exit-no">${step}</span><span class="step-state">${st}</span><span class="step-text">${inline(content!)}</span></li>`;
    })
    .join("");
}

// The benchmark table, from the rows that the Pages workflow wrote at deploy time.
async function bench(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  let rows: BenchRow[] = [];
  let meta: { sha?: string; date?: string } = {};
  try {
    const r = await fetch(`${base}bench.json`);
    if (r.ok) rows = (await r.json()) as BenchRow[];
    const m = await fetch(`${base}bench-meta.json`);
    if (m.ok) meta = (await m.json()) as typeof meta;
  } catch {
    rows = [];
  }
  if (rows.length === 0) {
    $("bench-intro").innerHTML = html(noBenchText);
    return;
  }
  $("bench-intro").innerHTML = html(benchText);
  if (meta.sha) {
    const sha = esc(meta.sha);
    const short = sha.slice(0, 7);
    $("bench-meta").innerHTML = `Raced on a GitHub runner${meta.date ? ` on ${esc(meta.date)}` : ""}, at commit <a href="https://github.com/mark1russell7/highways/commit/${sha}"><code>${short}</code></a>.`;
  }
  const fixtures = [...new Set(rows.map((r) => r.fixture))];
  const tabs = $("bench-tabs");
  let pick = fixtures.includes("mid-fanout") ? "mid-fanout" : fixtures[fixtures.length - 1]!;
  const draw = (): void => {
    tabs.innerHTML = "";
    for (const f of fixtures) {
      const b = document.createElement("button");
      b.type = "button";
      b.role = "tab";
      b.textContent = f;
      b.setAttribute("aria-selected", String(f === pick));
      b.addEventListener("click", () => {
        pick = f;
        draw();
      });
      tabs.append(b);
    }
    const list = rows.filter((r) => r.fixture === pick);
    const cols: { name: string; get: (r: BenchRow) => number; show: (v: number, r: BenchRow) => string }[] = [
      { name: "Time (ms)", get: (r) => r.ms, show: (v) => (v < 10 ? v.toFixed(1) : fmt.format(Math.round(v))) },
      { name: "Ink", get: (r) => r.quality.ink, show: (v) => fmt.format(Math.round(v)) },
      { name: "Crossings", get: (r) => r.quality.crossings, show: (v, r) => `${r.quality.crossingsEstimated ? "≈" : ""}${fmt.format(v)}` },
      { name: "Bends", get: (r) => r.quality.bends, show: (v) => v.toFixed(2) },
      { name: "Detour", get: (r) => r.quality.detour, show: (v) => v.toFixed(2) },
      { name: "Broken rules", get: (r) => r.violations, show: (v) => fmt.format(v) },
    ];
    const best = cols.map((c) => Math.min(...list.map(c.get)));
    const first = list[0];
    const head = `<tr><th scope="col">Router</th>${cols.map((c) => `<th scope="col">${c.name}</th>`).join("")}</tr>`;
    const body = list
      .map(
        (r) =>
          `<tr><th scope="row"><button type="button" class="table-pick" data-router="${esc(r.router)}" title="Show ${esc(r.router)} on the map"><code>${esc(r.router)}</code></button></th>${cols
            .map((c, i) => {
              const v = c.get(r);
              return `<td class="${v === best[i] && list.length > 1 ? "best" : ""}">${c.show(v, r)}</td>`;
            })
            .join("")}</tr>`,
      )
      .join("");
    $("bench-table").innerHTML = `<table class="num"><caption>${esc(pick)}${first ? `: ${fmt.format(first.nodes)} nodes, ${fmt.format(first.edges)} edges` : ""}</caption><thead>${head}</thead><tbody>${body}</tbody></table>`;
    for (const b of $("bench-table").querySelectorAll<HTMLButtonElement>("[data-router]"))
      b.addEventListener("click", () => {
        if (DEMO_FIXTURES.some((f) => f.name === pick)) {
          state.fixture = pick;
          fixtureSelect.value = pick;
        }
        pickRouter(b.dataset["router"]!);
        $("map").scrollIntoView({ block: "center" });
      });
  };
  draw();
}

road();
void bench();
void update();
