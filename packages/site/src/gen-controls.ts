// The controls of a generated board (CORPUS-GEN): the family, the seed and one control for each dimension of the family.
// The examples page, the compare page and the demo use them, so the three pages take the same boards and the same hash keys.
import {
  cleanGen,
  GEN_FAMILIES,
  genControls,
  genFamily,
  genValues,
  newSeed,
  MAX_SEED,
  sliderIndex,
  sliderValue,
  type GenControl,
  type GenSpec,
} from "./generated.ts";

/** This function gives the text of a value of a dimension for the page. */
const shown = (v: unknown): string => (typeof v === "number" ? String(Number(v.toPrecision(4))) : String(v));

/** This function gives one row of a control: a label, the input and, for a slider, the value as text. */
function controlRow(id: string, control: GenControl, value: unknown, changed: (v: number | string | boolean) => void): HTMLElement {
  const { dim } = control;
  const wrap = document.createElement("div");
  wrap.className = control.kind === "check" ? "cmp-option check gen-dim" : "cmp-option gen-dim";
  wrap.title = dim.meaning ?? dim.name;
  wrap.dataset["dim"] = dim.name;
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = dim.name;
  if (control.kind === "select") {
    const select = document.createElement("select");
    select.id = id;
    for (const v of control.values) select.append(new Option(v, v, false, v === value));
    select.addEventListener("change", () => changed(select.value));
    wrap.append(label, select);
    return wrap;
  }
  if (control.kind === "check") {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.id = id;
    box.checked = value === true;
    box.addEventListener("change", () => changed(box.checked));
    wrap.append(box, label);
    return wrap;
  }
  const slider = document.createElement("input");
  slider.type = "range";
  slider.id = id;
  slider.min = "0";
  slider.max = String(control.steps);
  slider.step = "1";
  slider.value = String(sliderIndex(dim, value as number));
  const out = document.createElement("output");
  out.htmlFor.add(id);
  out.textContent = shown(value);
  slider.setAttribute("aria-valuetext", out.textContent);
  // The text follows the slider at once. The board changes when the slider stops.
  slider.addEventListener("input", () => {
    out.textContent = shown(sliderValue(dim, Number(slider.value)));
    slider.setAttribute("aria-valuetext", out.textContent);
  });
  slider.addEventListener("change", () => changed(sliderValue(dim, Number(slider.value))));
  const field = document.createElement("div");
  field.className = "gen-slider";
  field.append(slider, out);
  wrap.append(label, field);
  return wrap;
}

/**
 * This function gives the controls of a generated board as a field set: the family, the seed with "New seed", and one control for each dimension.
 * The function `changed` gets each new spec. It keeps only the dimensions away from their defaults.
 */
export function genPanel(prefix: string, spec: GenSpec, changed: (spec: GenSpec) => void): HTMLFieldSetElement {
  const clean = cleanGen(spec);
  const family = genFamily(clean.family)!;
  const values = genValues(clean);
  const set = document.createElement("fieldset");
  set.className = "cmp-option-set gen-panel";
  const legend = document.createElement("legend");
  legend.textContent = "Generated board";
  set.append(legend);

  const famRow = document.createElement("div");
  famRow.className = "cmp-option";
  const famLabel = document.createElement("label");
  famLabel.htmlFor = `${prefix}-family`;
  famLabel.textContent = "family";
  const famSelect = document.createElement("select");
  famSelect.id = `${prefix}-family`;
  for (const f of GEN_FAMILIES) famSelect.append(new Option(f.name, f.name, false, f.name === family.name));
  // A new family starts at its defaults, with the same seed.
  famSelect.addEventListener("change", () => changed({ family: famSelect.value, seed: clean.seed, dims: {} }));
  famRow.append(famLabel, famSelect);

  const meaning = document.createElement("p");
  meaning.className = "gen-meaning";
  meaning.textContent = family.meaning;

  const seedRow = document.createElement("div");
  seedRow.className = "cmp-option gen-seed";
  const seedLabel = document.createElement("label");
  seedLabel.htmlFor = `${prefix}-seed`;
  seedLabel.textContent = "seed";
  const seedBox = document.createElement("div");
  seedBox.className = "gen-seed-box";
  const seed = document.createElement("input");
  seed.type = "number";
  seed.id = `${prefix}-seed`;
  seed.min = "0";
  seed.max = String(MAX_SEED);
  seed.step = "1";
  seed.value = String(clean.seed);
  seed.addEventListener("change", () => changed({ ...clean, seed: Number(seed.value) }));
  const again = document.createElement("button");
  again.type = "button";
  again.className = "exit quiet gen-new-seed";
  again.textContent = "New seed";
  again.addEventListener("click", () => changed({ ...clean, seed: newSeed() }));
  seedBox.append(seed, again);
  seedRow.append(seedLabel, seedBox);

  set.append(famRow, meaning, seedRow);
  for (const control of genControls(family))
    set.append(controlRow(`${prefix}-dim-${control.dim.name}`, control, values[control.dim.name], (v) => changed({ ...clean, dims: { ...clean.dims, [control.dim.name]: v } })));
  return set;
}
