import { COMPARE_STEPS, listStrategies, STRATEGIES, type CompareStep, type Strategy } from "@mark1russell7/highways";
import compareText from "../content/compare.md?raw";
import {
  cleanOptions,
  COLUMNS,
  COMPARE_BOARDS,
  controlOptions,
  formatHash,
  formatValue,
  parseHash,
  STEP_NAMES,
  type ComparePanels,
  type CompareState,
  type ControlOption,
  type Panel,
} from "./compare-data.ts";
import { html, sectionOf } from "./content.ts";
import type { CompareReply, CompareRequest } from "./protocol.ts";
import "./style.css";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element "${id}".`);
  return el as T;
};

const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = new Intl.NumberFormat("en-US");

/** The names of the axes of the fronts that are not columns of the page. */
const AXIS_NAMES: Readonly<Record<string, string>> = { "R1.perEdge": "crossings per edge" };

/** The noun of the strategies of each step. */
const NOUNS: Readonly<Record<CompareStep, string>> = { group: "grouping rules", router: "routers", curve: "curves" };

let state: CompareState = parseHash(location.hash);

$("intro").innerHTML = html(compareText.split(/\r?\n## /)[0]!.trim());
$("howto-body").innerHTML = html(sectionOf(compareText, "How to read the panels"));

// The worker: one request at a time. A new request stops the old worker, so a slow step does not hold the page.
let worker: Worker | undefined;
let busy = false;
let next = 0;

function startWorker(): Worker {
  const w = new Worker(new URL("./compare.worker.ts", import.meta.url), { type: "module" });
  w.addEventListener("message", (event: MessageEvent<CompareReply>) => {
    if (event.data.id !== next) return;
    busy = false;
    $("panels").setAttribute("aria-busy", "false");
    if (event.data.ok) show(event.data.panels);
    else $("status").textContent = `The worker stopped: ${event.data.error}`;
  });
  return w;
}

/** This function asks the worker for the panels of the state. */
function run(): void {
  if (busy && worker) {
    worker.terminate();
    worker = undefined;
  }
  worker ??= startWorker();
  busy = true;
  next++;
  const board = COMPARE_BOARDS.find((b) => b.id === state.board)!;
  const count = listStrategies(STRATEGIES, state.step).length;
  $("status").textContent = `The worker runs ${count} ${NOUNS[state.step]} on ${board.name}…`;
  $("panels").setAttribute("aria-busy", "true");
  $("panels").classList.add("stale");
  const request: CompareRequest = { id: next, state };
  worker.postMessage(request);
}

/** This function sets the state, writes the hash, and asks for the panels again. */
function set(change: Partial<CompareState>): void {
  const step = change.step ?? state.step;
  state = { step, board: change.board ?? state.board, options: cleanOptions(step, change.options ?? (change.step ? {} : state.options)) };
  const hash = formatHash(state);
  if (location.hash !== hash) history.replaceState(null, "", hash);
  controls();
  run();
}

// The steps: a row of exit signs.
const stepRow = $("steps");
for (const step of COMPARE_STEPS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "exit";
  button.setAttribute("role", "radio");
  button.dataset["step"] = step;
  button.textContent = STEP_NAMES[step];
  button.addEventListener("click", () => {
    if (state.step !== step) set({ step });
  });
  stepRow.append(button);
}
stepRow.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const i = COMPARE_STEPS.indexOf(state.step);
  const step = COMPARE_STEPS[(i + (e.key === "ArrowRight" ? 1 : COMPARE_STEPS.length - 1)) % COMPARE_STEPS.length]!;
  set({ step });
  stepRow.querySelector<HTMLButtonElement>(`[data-step="${step}"]`)?.focus();
  e.preventDefault();
});

const boardSelect = $<HTMLSelectElement>("board");
for (const b of COMPARE_BOARDS) {
  const option = document.createElement("option");
  option.value = b.id;
  option.textContent = `${b.name}: ${fmt.format(b.nodes)} nodes, ${fmt.format(b.edges)} edges`;
  boardSelect.append(option);
}
boardSelect.addEventListener("change", () => set({ board: boardSelect.value }));
$("reset").addEventListener("click", () => set({ options: {} }));
addEventListener("hashchange", () => {
  const parsed = parseHash(location.hash);
  if (formatHash(parsed) === formatHash(state)) return;
  state = parsed;
  controls();
  run();
});

/** This function gives the control of one option of one strategy. */
function control(strategy: string, key: string, d: ControlOption, fallback: unknown): HTMLElement {
  const id = `opt-${strategy}-${key}`;
  const value = state.options[strategy]?.[key] ?? fallback;
  const wrap = document.createElement("div");
  wrap.className = d.type === "boolean" ? "cmp-option check" : "cmp-option";
  wrap.title = d.describe;
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = key;
  const changed = (v: unknown): void => {
    const own: Record<string, unknown> = { ...state.options[strategy] };
    if (v === undefined) delete own[key];
    else own[key] = v;
    set({ options: { ...state.options, [strategy]: own as Record<string, number | boolean | string> } });
  };
  let input: HTMLInputElement | HTMLSelectElement;
  if (d.type === "boolean") {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = value === true;
    box.addEventListener("change", () => changed(box.checked));
    input = box;
    wrap.append(box, label);
  } else if (d.type === "enum") {
    const select = document.createElement("select");
    for (const v of d.values) select.append(new Option(v, v, false, v === value));
    select.addEventListener("change", () => changed(select.value));
    input = select;
    wrap.append(label, select);
  } else {
    const num = document.createElement("input");
    num.type = "number";
    num.min = String(d.min);
    num.max = String(d.max);
    num.step = String(d.step ?? (d.type === "integer" ? 1 : "any"));
    if (typeof value === "number" && Number.isFinite(value)) num.value = String(value);
    else num.placeholder = typeof value === "number" ? (value > 0 ? "∞" : "−∞") : "";
    num.addEventListener("change", () => changed(num.value.trim() === "" ? undefined : Number(num.value)));
    input = num;
    wrap.append(label, num);
  }
  input.id = id;
  return wrap;
}

/** This function writes the controls of the state: the step, the board and the options of each strategy. */
function controls(): void {
  for (const b of stepRow.querySelectorAll<HTMLButtonElement>(".exit")) {
    const on = b.dataset["step"] === state.step;
    b.setAttribute("aria-checked", String(on));
    b.tabIndex = on ? 0 : -1;
  }
  boardSelect.value = state.board;
  const body = $("option-body");
  body.replaceChildren();
  let changed = 0;
  for (const strategy of listStrategies(STRATEGIES, state.step) as readonly Strategy<CompareStep, object>[]) {
    const options = controlOptions(strategy);
    if (options.length === 0) continue;
    const group = document.createElement("fieldset");
    group.className = "cmp-option-set";
    const legend = document.createElement("legend");
    legend.textContent = strategy.name;
    group.append(legend, ...options.map((o) => control(strategy.name, o.key, o.declaration, o.value)));
    body.append(group);
    changed += Object.keys(state.options[strategy.name] ?? {}).length;
  }
  if (body.childElementCount === 0) body.textContent = "The strategies of this step have no options that a control can set.";
  $("option-count").textContent = changed > 0 ? `(${changed} changed)` : "";
  $<HTMLButtonElement>("reset").disabled = changed === 0;
}

/** This function draws one panel as SVG. */
function svgOf(p: Panel, board: string): string {
  const { view, boxes, groups, paths } = p.drawing;
  const rects = boxes.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`).join("");
  const outlines = groups.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${Math.min(b.w, b.h) * 0.04}"/>`).join("");
  const lines = paths.map((l) => `<path d="${l.d}"${l.width === 1 ? "" : ` style="stroke-width:${l.width.toFixed(1)}px"`}/>`).join("");
  return `<svg class="cmp-map" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" role="img" aria-label="The output of ${esc(p.strategy)} on ${esc(board)}"><g class="cmp-groups">${outlines}</g><g class="cmp-routes">${lines}</g><g class="cmp-boxes">${rects}</g></svg>`;
}

/** This function writes the tags of a panel: the front and the faults of the hard rules. */
function tagsOf(p: Panel): string {
  if (p.skipped) return `<span class="tag">Skipped: ${esc(p.skipped)}</span>`;
  const tags: string[] = [];
  if (p.front) tags.push(`<span class="tag front">On the front</span>`);
  if (p.violations > 0) tags.push(`<span class="tag bad">${fmt.format(p.violations)} hard-rule ${p.violations === 1 ? "fault" : "faults"}</span>`);
  return tags.join("");
}

/** This function shows the panels and the table of the measures. */
function show(data: ComparePanels): void {
  const board = COMPARE_BOARDS.find((b) => b.id === data.board)!;
  const columns = COLUMNS[data.step];
  const front = data.panels.filter((p) => p.front).map((p) => `<strong>${esc(p.strategy)}</strong>`);
  const axes = data.objectives.map((o) => `${AXIS_NAMES[o.key] ?? columns.find((c) => c.key === o.key)?.label.toLowerCase() ?? o.key} ${o.better === "min" ? "↓" : "↑"}`);
  $("status").textContent = `${data.panels.length} ${NOUNS[data.step]} on ${board.name} (${fmt.format(data.nodes)} nodes, ${fmt.format(data.edges)} edges): ${fmt.format(Math.round(data.ms))} ms on this device.`;
  $("front").innerHTML = `Pareto front: ${front.join(", ") || "no strategy"}. Its axes: ${esc(axes.join(", "))}.`;

  // The table: one row for each strategy, one column for each measure, with a bar of the value against the largest value.
  const largest = columns.map((c) => Math.max(0, ...data.panels.map((p) => p.measures.find((m) => m.key === c.key)?.value ?? 0).filter((v) => Number.isFinite(v))));
  const head = `<thead><tr><th scope="col">${STEP_NAMES[data.step]}</th>${columns.map((c) => `<th scope="col" title="${esc(c.describe)}">${esc(c.label)}${c.better ? (c.better === "min" ? " ↓" : " ↑") : ""}</th>`).join("")}</tr></thead>`;
  const rows = data.panels.map((p) => {
    const cells = columns.map((c, i) => {
      const m = p.measures.find((x) => x.key === c.key)!;
      const f = m.value === Infinity ? 1 : largest[i]! > 0 && Number.isFinite(m.value) ? Math.max(0, m.value) / largest[i]! : 0;
      return `<td${m.best ? ' class="best"' : ""}>${esc(formatValue(m.value, c))}${m.best ? '<span class="star" aria-label="best"> ★</span>' : ""}<span class="bar" style="--f:${f.toFixed(3)}"></span></td>`;
    });
    const name = `<button type="button" class="table-pick" data-panel="${esc(p.strategy)}"><code>${esc(p.strategy)}</code></button>${p.front ? ' <span class="dot" title="On the Pareto front">◆</span>' : ""}`;
    return `<tr${p.violations > 0 || p.skipped ? ' class="faulty"' : ""}><th scope="row">${name}</th>${cells.join("")}</tr>`;
  });
  $("table").innerHTML = `${head}<tbody>${rows.join("")}</tbody>`;

  const grid = $("panels");
  grid.innerHTML = data.panels
    .map((p) => {
      const measures = p.measures
        .map((m, i) => `<div${m.best ? ' class="best"' : ""} title="${esc(columns[i]!.describe)}"><dt>${esc(m.label)}</dt><dd>${esc(formatValue(m.value, columns[i]!))}${m.best ? '<span class="star" aria-label="best"> ★</span>' : ""}</dd></div>`)
        .join("");
      const options = Object.entries(p.options).map(([k, v]) => `<code>${esc(k)} ${esc(String(v))}</code>`).join(" ");
      const cls = ["cmp-panel", p.front ? "front" : "", p.violations > 0 || p.skipped ? "faulty" : ""].filter(Boolean).join(" ");
      return `<article class="${cls}" id="panel-${esc(p.strategy)}" aria-labelledby="title-${esc(p.strategy)}">
        <header class="cmp-head"><h3 id="title-${esc(p.strategy)}">${esc(p.strategy)}</h3><div class="cmp-tags">${tagsOf(p)}</div></header>
        <p class="cmp-describe">${esc(p.describe)}${options ? `<br />Options: ${options}` : ""}</p>
        ${svgOf(p, board.name)}
        <dl class="cmp-measures">${measures}</dl>
      </article>`;
    })
    .join("");
  grid.classList.remove("stale");
}

$("table").addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-panel]");
  const panel = button && document.getElementById(`panel-${button.dataset["panel"]}`);
  panel?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
});

if (location.hash !== formatHash(state)) history.replaceState(null, "", formatHash(state));
controls();
run();
