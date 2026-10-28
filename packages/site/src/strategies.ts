// The strategies page (STRATEGY-CARDS). The build gives all its data from the registry and the committed files, so the page reads no network.
import data from "virtual:strategies";
import type { VerdictLabel } from "./results-data.ts";
import { cardId, STATUSES, SWEEPS_LINE, type CardIdea, type CardStatus, type StrategyCard } from "./strategies-data.ts";
import "./style.css";
import "./strategies.css";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element "${id}".`);
  return el as T;
};

const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** This function escapes a text and shows each span between backticks as code. */
const code = (text: string): string => esc(text).replace(/`([^`]+)`/g, "<code>$1</code>");
const REPO = "https://github.com/mark1russell7/highways";

/** The mark and the class of each verdict label, as on the results page. */
const GLYPH: Readonly<Record<VerdictLabel, string>> = { better: "▲", worse: "▼", "depends on the mix": "◆", "no verdict": "○" };
const CLS: Readonly<Record<VerdictLabel, string>> = { better: "lab-better", worse: "lab-worse", "depends on the mix": "lab-mix", "no verdict": "lab-none" };
const STATUS_TEXT = Object.fromEntries(STATUSES.map((s) => [s.id, s.text])) as Record<CardStatus, string>;

const state = { step: "all", statuses: new Set<CardStatus>(STATUSES.map((s) => s.id)), find: "" };

// The tiles at the top: the cards of each step.
function tiles(): void {
  const items = data.steps.map((step) => [String(data.cards.filter((c) => c.step === step).length), `strategies of the step <code>${esc(step)}</code>`] as const);
  $("tiles").innerHTML = [[String(data.cards.length), "cards"] as const, ...items].map(([n, t]) => `<div><dt>${t}</dt><dd>${n}</dd></div>`).join("");
}

function controls(): void {
  const steps = ["all", ...data.steps];
  $("steps").innerHTML = steps.map((v) => `<label><input type="radio" name="steps" value="${esc(v)}"${v === state.step ? " checked" : ""} /><span>${esc(v)}</span></label>`).join("");
  for (const input of $("steps").querySelectorAll<HTMLInputElement>("input"))
    input.addEventListener("change", () => {
      state.step = input.value;
      grid();
    });
  $("statuses").innerHTML = STATUSES.map(
    (s) => `<label class="res-chip sc-st-${s.id}"><input type="checkbox" value="${s.id}"${state.statuses.has(s.id) ? " checked" : ""} /><span>${esc(s.text)}</span></label>`,
  ).join("");
  for (const input of $("statuses").querySelectorAll<HTMLInputElement>("input"))
    input.addEventListener("change", () => {
      const s = input.value as CardStatus;
      if (input.checked) state.statuses.add(s);
      else state.statuses.delete(s);
      grid();
    });
}

$<HTMLInputElement>("find").addEventListener("input", (e) => {
  state.find = (e.target as HTMLInputElement).value.trim().toLowerCase();
  grid();
});

/** This function tells if a card passes the filters. The search finds the name and the idea ids. */
const shown = (c: StrategyCard): boolean =>
  (state.step === "all" || c.step === state.step) &&
  state.statuses.has(c.status) &&
  (state.find === "" || c.name.toLowerCase().includes(state.find) || [...c.ideas, ...c.optionIdeas].some((id) => id.toLowerCase().includes(state.find)));

/** This function gives one idea of a card: its papers, its mechanism, its math, its cost and its guarantee. */
function idea(id: string, via: string): string {
  const r: CardIdea | undefined = data.ideas[id];
  if (r === undefined) return `<li><code>${esc(id)}</code></li>`;
  const sources = r.sources.length === 0 ? "<p>No source paper. The idea comes from this project.</p>" : `<ul class="sc-sources">${r.sources.map((s) => `<li><a href="${esc(s.url)}">${esc(s.title)}</a>. ${esc(s.authors)}, ${s.year}.</li>`).join("")}</ul>`;
  const guarantee = r.guarantee.length === 0 ? "none stated" : r.guarantee.map(esc).join(" ");
  return `<li><details><summary><code>${esc(r.id)}</code> ${esc(r.name)} <span class="sc-stage">${esc(r.stage)}</span>${via}</summary>
    ${sources}
    <dl class="sc-facts"><dt>Mechanism</dt><dd>${code(r.mechanism)}</dd><dt>Math</dt><dd>${code(r.math)}</dd><dt>Complexity</dt><dd>${code(r.cost)}</dd><dt>Guarantee</dt><dd>${guarantee}</dd>${r.verdict ? `<dt>Screen</dt><dd>${code(r.verdict)}</dd>` : ""}</dl>
    <p><a href="${REPO}/blob/main/docs/research/ideas/index.json">The record</a> is in the catalog of ideas.</p></details></li>`;
}

/** This function gives the ideas part of a card. */
function ideasPart(c: StrategyCard): string {
  if (c.ideas.length === 0 && c.optionIdeas.length === 0) return `<p class="sc-none">No idea record. It is one of the first built-in strategies.</p>`;
  const optionOf = (id: string): string => {
    const keys = c.options.filter((o) => o.ideas.includes(id)).map((o) => `<code>${esc(o.key)}</code>`);
    return keys.length === 0 ? "" : ` <span class="sc-via">option ${keys.join(", ")}</span>`;
  };
  const all = [...c.ideas, ...c.optionIdeas];
  const stated = all.filter((id) => (data.ideas[id]?.guarantee.length ?? 0) > 0);
  return `<h4>Ideas</h4><ul class="sc-ideas">${all.map((id) => idea(id, c.ideas.includes(id) ? "" : optionOf(id))).join("")}</ul>
    <p class="sc-guarantee">Guarantee: ${stated.length === 0 ? "none stated" : `stated in ${stated.map((id) => `<code>${esc(id)}</code>`).join(", ")}`}.</p>`;
}

/** This function gives the options part of a card: the name, the type, the range and the default of each option. */
function optionsPart(c: StrategyCard): string {
  if (c.options.length === 0) return `<p class="sc-none">No options.</p>`;
  const rows = c.options
    .map((o) => `<tr><th scope="row" title="${esc(o.describe)}"><code>${esc(o.key)}</code></th><td>${esc(o.type)}</td><td>${code(o.range)}</td><td>${code(o.default)}</td></tr>`)
    .join("");
  return `<details class="sc-options"><summary>${c.options.length} ${c.options.length === 1 ? "option" : "options"}</summary><div class="table-wrap"><table><thead><tr><th scope="col">Option</th><th scope="col">Type</th><th scope="col">Range</th><th scope="col">Default</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

/** This function gives the verdicts part of a card: each set, with the label and the breadth of each guard. */
function verdictsPart(c: StrategyCard): string {
  if (c.status === "default" && c.sets.length === 0 && c.step === "router") return `<p class="sc-none">This strategy is the base of the verdicts of its step.</p>`;
  if (c.sets.length === 0) return `<p class="sc-none">No verdict snapshot for this step.</p>`;
  return c.sets
    .map(
      (s) =>
        `<div class="sc-set"><p><code>${esc(s.set)}</code> against <code>${esc(s.base)}</code> (<a href="${REPO}/actions/runs/${s.run}">run</a>)</p><ul class="sc-verdicts">${s.verdicts
          .map((v) => `<li class="${CLS[v.label]}" title="${esc(v.measure)}"><b aria-hidden="true">${GLYPH[v.label]}</b> ${esc(v.guard)}: ${esc(v.label)}, ${esc(v.breadth)}</li>`)
          .join("")}</ul></div>`,
    )
    .join("");
}

/** This function gives the time part of a router card, from the benchmark snapshot. */
function benchPart(c: StrategyCard): string {
  if (c.bench === undefined) return "";
  const ratio = Number.isNaN(c.bench.ratio) ? "" : c.name === "shared" ? "" : ` Paired ratio to <code>shared</code>: ${c.bench.ratio}.`;
  return `<p class="sc-bench">Bench: median ${c.bench.medianMs} ms over ${c.bench.fixtures} fixtures.${ratio}</p>`;
}

/** This function gives one card. */
function card(c: StrategyCard): string {
  const verdictLink = c.sets.length > 0 ? ` <a href="results.html#verdicts">The verdict grid</a>.` : "";
  return `<article class="sc-card panel" id="${esc(cardId(c.step, c.name))}">
    <header><h3><code>${esc(c.name)}</code></h3><p class="sc-tags"><span class="sc-step">${esc(c.step)}</span> <span class="sc-status sc-st-${c.status}">${esc(STATUS_TEXT[c.status])}</span></p></header>
    <p>${code(c.describe)}</p>
    ${ideasPart(c)}
    <h4>Options</h4>${optionsPart(c)}
    <h4>Verdicts</h4>${verdictsPart(c)}
    ${benchPart(c)}
    <p class="sc-sweeps">${esc(SWEEPS_LINE)}</p>
    <p class="sc-links"><a href="compare.html${esc(c.compare)}">Compare with this strategy</a>.${verdictLink}</p>
  </article>`;
}

function grid(): void {
  const cards = data.cards.filter(shown);
  const counts = STATUSES.map((s) => `${cards.filter((c) => c.status === s.id).length} ${esc(s.text)}`).join(", ");
  $("summary").textContent = `${cards.length} of ${data.cards.length} cards: ${counts}.`;
  $("grid").innerHTML = cards.length === 0 ? "<p>No card fits these filters.</p>" : cards.map(card).join("");
}

// A link `strategies.html#s-<step>-<name>` opens the page at that card, with all the filters open.
function target(): void {
  const id = decodeURIComponent(location.hash.replace(/^#/, ""));
  const c = data.cards.find((x) => cardId(x.step, x.name) === id);
  if (c === undefined) return;
  if (!shown(c)) {
    state.step = "all";
    state.find = "";
    state.statuses = new Set(STATUSES.map((s) => s.id));
    $<HTMLInputElement>("find").value = "";
    controls();
    grid();
  }
  const el = document.getElementById(id);
  for (const x of document.querySelectorAll(".sc-card.target")) x.classList.remove("target");
  el?.classList.add("target");
  el?.scrollIntoView({ block: "start" });
}

$("sources").innerHTML = `The verdicts come from the snapshots of <code>docs/research/verdicts</code>. The times come from the run <a href="${REPO}/actions/runs/${data.bench.run ?? ""}">${data.bench.run ?? "-"}</a> of the workflow <code>Bench</code> on ${esc(data.bench.date ?? "-")}.`;
tiles();
controls();
grid();
target();
addEventListener("hashchange", target);
