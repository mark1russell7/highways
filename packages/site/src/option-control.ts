import { controlOptions, textOptions, type ControlOption } from "./options.ts";
import type { Step, Strategy } from "@mark1russell7/highways";

/** The value of one option of a control, or `undefined` for the default. */
export type OptionValue = number | boolean | string | undefined;

/** This function gives the control of one option: a check box, a list or a number field. The function `changed` gets each new value. */
export function optionControl(id: string, key: string, d: ControlOption, value: unknown, changed: (v: OptionValue) => void): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = d.type === "boolean" ? "cmp-option check" : "cmp-option";
  wrap.title = d.describe;
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = key;
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
  } else if (d.values !== undefined) {
    // A number option with a list of values gets a list. Without a value, the first entry keeps the default of the strategy.
    const select = document.createElement("select");
    if (typeof value !== "number" || !d.values.includes(value)) select.append(new Option("default", "", false, true));
    for (const v of d.values) select.append(new Option(String(v), String(v), false, v === value));
    select.addEventListener("change", () => changed(select.value === "" ? undefined : Number(select.value)));
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

/**
 * This function gives the options of one strategy as a field set. Each option with a range gets a control.
 * Each other option shows its default value as text.
 * It gives `undefined` for a strategy without options.
 */
export function optionSet(
  prefix: string,
  strategy: Strategy<Step, object>,
  values: Readonly<Record<string, number | boolean | string>> | undefined,
  changed: (key: string, v: OptionValue) => void,
  legend: string = strategy.name,
): HTMLFieldSetElement | undefined {
  const controls = controlOptions(strategy);
  const texts = textOptions(strategy);
  if (controls.length + texts.length === 0) return undefined;
  const group = document.createElement("fieldset");
  group.className = "cmp-option-set";
  const title = document.createElement("legend");
  title.textContent = legend;
  group.append(title, ...controls.map((o) => optionControl(`${prefix}-${strategy.name}-${o.key}`, o.key, o.declaration, values?.[o.key] ?? o.value, (v) => changed(o.key, v))));
  for (const t of texts) {
    const row = document.createElement("div");
    row.className = "cmp-option fixed";
    row.title = `${t.describe} No control can set it, so it keeps its default.`;
    const name = document.createElement("span");
    name.textContent = t.key;
    const value = document.createElement("code");
    value.textContent = t.text;
    row.append(name, value);
    group.append(row);
  }
  return group;
}
