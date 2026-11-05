// The results page (SITE-LIVE). The build gives all its data from the committed files, so the page reads no network.
import data from "virtual:results";
import { ageText, LABELS, recordAge, type VerdictCell, type VerdictLabel, type VerdictTable } from "./results-data.ts";
import { cardId } from "./strategies-data.ts";
import "./style.css";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element "${id}".`);
  return el as T;
};

const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const REPO = "https://github.com/mark1russell7/highways";
/** The date of the viewer. A page built some time ago still shows the true age of its records. */
const TODAY = new Date().toISOString().slice(0, 10);
const count = (n: number): string => n.toLocaleString("en-US");
const percent = (value: number): string => `${Number((value * 100).toFixed(2))} %`;

/** This function gives the age and the core of a verdict snapshot as HTML. An older core has a mark, so the color is not the only sign. */
function ageHtml(t: VerdictTable): string {
  const age = recordAge(t.date, t.core, data.core, TODAY);
  const core = age.sameCore ? `the core of this site, <code>${esc(t.core)}</code>` : `core <code>${esc(t.core)}</code>, and this site builds on <code>${esc(data.core)}</code>`;
  return `${age.sameCore ? "" : '<b aria-hidden="true">⚠</b> '}From run <a href="${REPO}/actions/runs/${t.run}">${t.run}</a> on ${esc(t.date)}, ${ageText(age.days)}, on ${core}.`;
}

/** The mark of each label. The page does not show a label by its color only. */
const GLYPH: Readonly<Record<VerdictLabel, string>> = { better: "▲", worse: "▼", "depends on the mix": "◆", "no verdict": "○" };
/** The class of each label. */
const CLS: Readonly<Record<VerdictLabel, string>> = { better: "lab-better", worse: "lab-worse", "depends on the mix": "lab-mix", "no verdict": "lab-none" };

/** This function gives the breadth of a cell as text, for example "worse on 2 of 6". */
function breadth(c: VerdictCell): string {
  const ties = c.ties > 0 ? ` (${c.ties} ${c.ties === 1 ? "tie" : "ties"})` : "";
  if (c.label === "better") return `worse on ${c.against} of ${c.of}${ties}`;
  if (c.label === "worse") return `better on ${c.against} of ${c.of}${ties}`;
  const wins = [...c.signs].filter((s) => s === "+").length;
  const losses = [...c.signs].filter((s) => s === "-").length;
  return `wins ${wins}, loses ${losses} of ${c.of}`;
}

/** This function gives the marks of the families of a cell. */
const signMarks = (signs: string): string =>
  `<span class="res-signs" aria-hidden="true">${[...signs].map((s) => `<i class="${s === "+" ? "up" : s === "-" ? "down" : "tie"}"></i>`).join("")}</span>`;

const sets = [...new Set(data.tables.map((t) => t.set))];
const state = {
  set: sets.at(-1) ?? "",
  step: "highway",
  labels: new Set<VerdictLabel>(LABELS),
  find: "",
  pick: undefined as { strategy: string; guard: string } | undefined,
};

const table = (): VerdictTable | undefined => data.tables.find((t) => t.set === state.set && t.step === state.step) ?? data.tables.find((t) => t.set === state.set);

$("intro").innerHTML = data.text["intro"] ?? "";
$("verdicts-body").innerHTML = data.text["The verdicts"] ?? "";
$("split-body").innerHTML = data.text["Where no single default wins"] ?? "";
$("ideas-body").innerHTML = data.text["The ideas"] ?? "";
$("new-body").innerHTML = data.text["What is new"] ?? "";
$("queue-body").innerHTML = data.text["The build queue"] ?? "";
$("measures-body").innerHTML = data.text["The measures"] ?? "";
$("coverage-body").innerHTML = data.text["The coverage of the space"] ?? "";

/** The definition of each measure by its name in a record, from `MEASURES` of the core. */
const DEFINITION = new Map(data.measures.filter((m) => m.definition !== "").map((m) => [m.name, m.definition] as const));
/** This function gives the hint of a guard measure: its definition, or its name when the core has no definition. */
const hint = (measure: string): string => DEFINITION.get(measure) ?? measure;

// The tiles at the top: four numbers that a visitor reads first.
function tiles(): void {
  const last = data.tables.filter((t) => t.set === data.splitSet);
  const verdicts = last.reduce((n, t) => n + t.strategies.length * t.guards.length, 0);
  const kept = data.ideas.stages.find((s) => s.stage === "kept")?.count ?? 0;
  const items: [string, string, string][] = [
    [percent(data.coverage?.value ?? 0), "of the space has a fitted model", "#coverage"],
    [String(verdicts), `verdicts on <code>${esc(data.splitSet)}</code>`, "#verdicts"],
    [`${data.split.length} of ${data.betterCount}`, "<code>better</code> verdicts with families against them", "#split"],
    [`${kept} of ${data.ideas.total}`, "ideas kept by the screen", "#ideas"],
    [esc(data.shipped[0]?.date ?? "-"), `last item: ${esc(data.shipped[0]?.id ?? "-")}`, "#new"],
  ];
  $("tiles").innerHTML = items.map(([n, t, href]) => `<div><dt><a href="${href}">${t}</a></dt><dd>${n}</dd></div>`).join("");
}

// The radio buttons of the set and of the step.
function radios(id: string, values: readonly string[], current: string, pick: (v: string) => void): void {
  const el = $(id);
  el.innerHTML = values.map((v) => `<label><input type="radio" name="${id}" value="${esc(v)}"${v === current ? " checked" : ""} /><span>${esc(v)}</span></label>`).join("");
  for (const input of el.querySelectorAll<HTMLInputElement>("input")) input.addEventListener("change", () => pick(input.value));
}

function controls(): void {
  radios("sets", sets, state.set, (v) => {
    state.set = v;
    state.pick = undefined;
    draw();
  });
  const steps = [...new Set(data.tables.filter((t) => t.set === state.set).map((t) => t.step))];
  if (!steps.includes(state.step)) state.step = steps[0] ?? "";
  radios("steps", steps, state.step, (v) => {
    state.step = v;
    state.pick = undefined;
    draw();
  });
  $("labels").innerHTML = LABELS.map(
    (l) => `<label class="res-chip ${CLS[l]}"><input type="checkbox" value="${esc(l)}"${state.labels.has(l) ? " checked" : ""} /><span><b aria-hidden="true">${GLYPH[l]}</b> ${esc(l)}</span></label>`,
  ).join("");
  for (const input of $("labels").querySelectorAll<HTMLInputElement>("input"))
    input.addEventListener("change", () => {
      const l = input.value as VerdictLabel;
      if (input.checked) state.labels.add(l);
      else state.labels.delete(l);
      grid();
    });
}

$<HTMLInputElement>("find").addEventListener("input", (e) => {
  state.find = (e.target as HTMLInputElement).value.trim().toLowerCase();
  grid();
});

// The grid: the strategy rows and the guard columns of one set and one step.
function grid(): void {
  const t = table();
  if (t === undefined) {
    $("grid").innerHTML = "<p>No snapshot.</p>";
    $("age").innerHTML = "";
    return;
  }
  $("age").innerHTML = ageHtml(t);
  const rows = t.strategies.filter((s) => s.name.toLowerCase().includes(state.find) && s.cells.some((c) => state.labels.has(c.label)));
  const counts = LABELS.map((l) => [l, t.strategies.reduce((n, s) => n + s.cells.filter((c) => c.label === l).length, 0)] as const);
  $("summary").innerHTML = `${rows.length} of ${t.strategies.length} strategies of the step <code>${esc(t.step)}</code> on <code>${esc(t.set)}</code> against <code>${esc(t.base)}</code>. ${counts
    .map(([l, n]) => `<span class="res-count ${CLS[l]}"><b aria-hidden="true">${GLYPH[l]}</b> ${n} ${esc(l)}</span>`)
    .join(" ")}`;
  const head = `<tr><th scope="col">Strategy</th>${t.guards.map((g) => `<th scope="col" title="${esc(hint(g.measure))}">${esc(g.id)}<small>${esc(g.measure)}</small></th>`).join("")}</tr>`;
  const body = rows
    .map(
      (s) =>
        `<tr><th scope="row"><a href="strategies.html#${esc(cardId(t.step, s.name))}" title="The card of the strategy"><code>${esc(s.name)}</code></a></th>${s.cells
          .map((c) => {
            const on = state.labels.has(c.label);
            const picked = state.pick?.strategy === s.name && state.pick.guard === c.guard;
            return `<td><button type="button" class="res-cell ${CLS[c.label]}${on ? "" : " off"}${picked ? " picked" : ""}" data-s="${esc(s.name)}" data-g="${esc(c.guard)}" aria-pressed="${picked}" aria-label="${esc(`${s.name}, ${c.guard}: ${c.label}, ${breadth(c)}`)}"><span class="res-lab"><b aria-hidden="true">${GLYPH[c.label]}</b> ${esc(c.label)}</span><span class="res-breadth">${esc(breadth(c))}</span>${signMarks(c.signs)}</button></td>`;
          })
          .join("")}</tr>`,
    )
    .join("");
  $("grid").innerHTML = rows.length === 0 ? "<p>No strategy has a verdict with these filters.</p>" : `<table class="res-grid"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  for (const b of $("grid").querySelectorAll<HTMLButtonElement>("button[data-s]"))
    b.addEventListener("click", () => {
      state.pick = { strategy: b.dataset["s"]!, guard: b.dataset["g"]! };
      grid();
    });
  detail(t);
}

// The detail of the selected cell: the sign of each family.
function detail(t: VerdictTable): void {
  const s = t.strategies.find((x) => x.name === state.pick?.strategy);
  const c = s?.cells.find((x) => x.guard === state.pick?.guard);
  if (s === undefined || c === undefined) {
    $("detail").innerHTML = `<p class="hint">Select a cell to see its families.</p><p class="hint">Snapshot of the run <a href="${REPO}/actions/runs/${t.run}">${t.run}</a>, ${esc(t.date)}, core <code>${esc(t.core)}</code>, level ${t.level}.</p>`;
    return;
  }
  const g = t.guards.find((x) => x.id === c.guard);
  const word = (sign: string): string => (sign === "+" ? "wins" : sign === "-" ? "loses" : "tie");
  const noKey = (f: string): boolean => t.keyless?.includes(f) === true;
  const famWord = (f: string, sign: string): string => (noKey(f) ? (c.tiedByCause === undefined ? `${word(sign)}, base has 0 ways` : "tie by cause") : word(sign));
  const keyNote =
    t.keyless === undefined || t.keyless.length === 0
      ? ""
      : c.tiedByCause === undefined
        ? `<p class="hint">The base has 0 ways on ${t.keyless.length} of ${t.families.length} families, because they have no key. There, the base is <code>corners</code> with other tie breaks.</p>`
        : `<p class="hint">With no key, <code>shared</code> is <code>corners</code> with other tie breaks. So each of the ${t.keyless.length} families with no key is a tie by cause. The run read a sign on ${c.tiedByCause} of them. The label reads all ${c.of} families.</p>`;
  $("detail").innerHTML = `<p class="method"><strong><code>${esc(s.name)}</code></strong> against <code>${esc(t.base)}</code></p>
    <p><span class="res-count ${CLS[c.label]}"><b aria-hidden="true">${GLYPH[c.label]}</b> ${esc(c.label)}</span> on ${esc(c.guard)} <small>(${esc(g?.measure ?? "")})</small></p>
    ${g && DEFINITION.has(g.measure) ? `<p class="hint">${esc(DEFINITION.get(g.measure)!)}</p>` : ""}
    <p>${esc(breadth(c))}. Permutation p: ${c.p}.</p>
    ${keyNote}
    <ul class="res-fams">${t.families.map((f, i) => `<li class="${word(c.signs[i] ?? "0")}"><span aria-hidden="true">${c.signs[i] === "+" ? "+" : c.signs[i] === "-" ? "−" : "·"}</span> <code>${esc(f)}</code> ${esc(famWord(f, c.signs[i] ?? "0"))}</li>`).join("")}</ul>`;
}

// The better verdicts with families against them, by guard measure.
function split(): void {
  const groups = new Map<string, typeof data.split>();
  for (const v of data.split) groups.set(`${v.guard}|${v.measure}`, [...(groups.get(`${v.guard}|${v.measure}`) ?? []), v]);
  const sorted = [...groups].sort((a, b) => b[1].length - a[1].length);
  $("split-list").innerHTML =
    `<p class="res-summary">${data.split.length} of ${data.betterCount} <code>better</code> verdicts of <code>${esc(data.splitSet)}</code> have 1 or more families against them.</p>` +
    sorted
      .map(([key, list]) => {
        const [guard, measure] = key.split("|");
        return `<div class="res-group"><h3>${esc(guard!)} <small>${esc(measure!)}</small> <span class="res-n">${list.length}</span></h3><ul>${list
          .map((v) => `<li><code>${esc(v.strategy)}</code> <span class="res-step">${esc(v.step)}</span> <span class="res-against">loses on ${v.against.map((f) => `<span class="res-fam">${esc(f)}</span>`).join(" ")}</span></li>`)
          .join("")}</ul></div>`;
      })
      .join("");
}

// The ideas: the count of each stage as one bar, and the kept and opt-in strategies.
function ideas(): void {
  const total = data.ideas.total || 1;
  const name = (s: string): string => (s === "cataloged" ? "not built" : s);
  $("stages").innerHTML = `<div class="res-bar" role="img" aria-label="${esc(data.ideas.stages.map((s) => `${s.count} ${name(s.stage)}`).join(", "))}">${data.ideas.stages
    .map((s) => `<span class="st-${esc(s.stage)}" style="flex-grow:${s.count / total}" title="${s.count} ${esc(name(s.stage))}"></span>`)
    .join("")}</div><ul class="res-legend">${data.ideas.stages.map((s) => `<li><i class="st-${esc(s.stage)}"></i>${esc(name(s.stage))} <b>${s.count}</b></li>`).join("")}<li>all <b>${data.ideas.total}</b></li></ul>`;
  const rows = data.ideas.kept
    .map(
      (k) =>
        `<tr><th scope="row">${esc(k.id)}</th><td>${k.what ? `<code>${esc(k.what)}</code>` : ""}<div class="hint">${esc(k.name === k.id ? "" : k.name)}</div></td><td>${esc(k.step)}</td><td><span class="res-tag ${k.status === "kept" ? "lab-better" : "lab-mix"}">${k.status}</span></td><td>${k.default}</td><td>${k.note}</td><td>${esc(k.date)}</td><td>${k.link}</td></tr>`,
    )
    .join("");
  $("kept").innerHTML = `<table class="res-kept"><caption>The kept and opt-in strategies and options</caption><thead><tr><th scope="col">Id</th><th scope="col">Strategy or option</th><th scope="col">Step</th><th scope="col">State</th><th scope="col">Default</th><th scope="col">Result</th><th scope="col">Date</th><th scope="col">Link</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// The build queue: the count of each status and the top rows of the queue.
function queue(): void {
  const q = data.queue;
  $("queue-counts").innerHTML = `${q.statuses.map((s) => `<li><span class="res-tag ${s.status === "built" ? "lab-better" : s.status === "building" ? "lab-mix" : "lab-none"}">${esc(s.status)}</span> <b>${s.count}</b></li>`).join("")}<li>ranked <b>${q.ranked}</b></li><li>blocked <b>${q.blocked}</b></li>`;
  const rows = q.top
    .map((r) =>
      r.kind === "enabler"
        ? `<tr><td>${r.rank}</td><th scope="row">${esc(r.id)}<div class="hint">${esc(r.name)}</div></th><td><span class="res-tag lab-better">enabler</span></td><td>${r.score}</td><td><span class="res-tag lab-none">${esc(r.status)}</span><div class="hint">unblocks ${r.unblocks} ideas</div></td></tr>`
        : `<tr><td>${r.rank}</td><th scope="row">${esc(r.id)}<div class="hint">${esc(r.name)}</div></th><td>${esc(r.step)}</td><td>${r.score}</td><td><span class="res-tag ${r.status === "building" ? "lab-mix" : "lab-none"}">${esc(r.status)}</span>${r.blockedBy.length > 0 ? `<div class="hint">blocked by ${r.blockedBy.map((b) => `<code>${esc(b)}</code>`).join(" ")}</div>` : ""}</td></tr>`,
    )
    .join("");
  // The back test: the rank correlation on a scale from -1 to 1, with its bootstrap interval of 95 %.
  const b = q.backtest;
  const x = (v: number): number => Math.round(((v + 1) / 2) * 200 + 10);
  $("queue-backtest").innerHTML = `<svg viewBox="0 0 220 28" width="220" height="28" role="img" aria-label="Rank correlation ${b.rho.toFixed(2)}, interval ${b.low.toFixed(2)} to ${b.high.toFixed(2)}"><line x1="10" y1="14" x2="210" y2="14" stroke="currentColor" stroke-opacity="0.3"/><line x1="${x(0)}" y1="8" x2="${x(0)}" y2="20" stroke="currentColor" stroke-opacity="0.5"/><rect x="${x(b.low)}" y="9" width="${x(b.high) - x(b.low)}" height="10" rx="3" fill="currentColor" fill-opacity="0.25"/><circle cx="${x(b.rho)}" cy="14" r="4" fill="currentColor"/><text x="10" y="27" font-size="8" fill="currentColor">-1</text><text x="${x(0) - 2}" y="27" font-size="8" fill="currentColor">0</text><text x="204" y="27" font-size="8" fill="currentColor">1</text></svg> The back test of the gain on ${b.ideas} built ideas: the rank correlation is <b>${b.rho.toFixed(2)}</b>, with a bootstrap interval of 95 % from <b>${b.low.toFixed(2)}</b> to <b>${b.high.toFixed(2)}</b> (${b.resamples} resamples).`;
  $("queue-top").innerHTML = `<table class="res-kept"><caption>The top ${q.top.length} of the queue on ${esc(q.date)} (formula <code>${esc(q.formula)}</code>)</caption><thead><tr><th scope="col">Rank</th><th scope="col">Idea</th><th scope="col">Step</th><th scope="col">Score</th><th scope="col">Status</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// The measures of the records: each measure with a definition in a table, and the others in a list that opens.
function measures(): void {
  const row = (m: (typeof data.measures)[number]): string =>
    `<tr><th scope="row">${esc(m.id)}</th><td><code>${esc(m.name)}</code></td><td>${esc(m.unit)}</td><td>${m.better === "lower" ? "lower" : "higher"}</td><td>${esc(m.definition)}</td></tr>`;
  const head = `<thead><tr><th scope="col">Id</th><th scope="col">Name in a record</th><th scope="col">Unit</th><th scope="col">Better</th><th scope="col">Definition</th></tr></thead>`;
  const defined = data.measures.filter((m) => m.definition !== "");
  const rest = data.measures.filter((m) => m.definition === "");
  $("measure-list").innerHTML =
    `<table class="res-kept"><caption>The ${defined.length} measures with a definition in the core</caption>${head}<tbody>${defined.map(row).join("")}</tbody></table>` +
    `<details><summary>The other ${rest.length} measures</summary><table class="res-kept">${head}<tbody>${rest.map(row).join("")}</tbody></table></details>`;
}

// What is new: the last Shipped rows of the roadmap.
function news(): void {
  $("news").innerHTML = data.shipped
    .map((r) => `<li><span class="res-date">${esc(r.date)}</span><span class="exit-no">${esc(r.id)}</span><span class="res-item">${r.item}</span><span class="res-link">${r.link}</span></li>`)
    .join("");
}

// The panel of the coverage of the space: the value, its denominator and the weekly points.
function coverage(): void {
  const c = data.coverage;
  if (c === undefined) return;
  const last = c.trend.at(-1);
  $("coverage-value").innerHTML = `<b>${percent(c.value)}</b>: ${count(c.fitted)} of ${count(c.cells)} cells. A cell is one of ${count(c.measures)} measures on one of ${count(c.strategies + c.options + c.inputs)} dimensions: ${count(c.strategies)} strategies, ${count(c.options)} options and ${count(c.inputs)} input dimensions.`;
  $("coverage-trend").innerHTML = `<table><thead><tr><th scope="col">Date</th><th scope="col">Core</th><th scope="col">Cells with a fit</th><th scope="col">Cells</th><th scope="col">Value</th></tr></thead><tbody>${c.trend
    .map((p) => `<tr><td>${esc(p.date)}</td><td><code>${esc(p.core)}</code></td><td>${count(p.fitted)}</td><td>${count(p.cells)}</td><td>${percent(p.value)}${p.reason ? ` <small>${esc(p.reason)}</small>` : ""}</td></tr>`)
    .join("")}</tbody></table>`;
  $("coverage-age").textContent = last === undefined ? "" : `The last point is ${ageText(recordAge(last.date, last.core, data.core, TODAY).days)}.`;
}

// The data line of this page: the run, the date, the age and the core of each snapshot.
function snapshots(): void {
  $("snapshots").innerHTML = `Snapshots: ${data.tables
    .map((t) => {
      const age = recordAge(t.date, t.core, data.core, TODAY);
      return `<code>${esc(t.set)}</code> <code>${esc(t.step)}</code> from the run <a href="${REPO}/actions/runs/${t.run}">${t.run}</a> on ${esc(t.date)} (${ageText(age.days)}, core <code>${esc(t.core)}</code>)`;
    })
    .join(", ")}. This site builds on core <code>${esc(data.core)}</code>.`;
}

function draw(): void {
  controls();
  grid();
}

tiles();
draw();
split();
coverage();
ideas();
queue();
measures();
news();
snapshots();
