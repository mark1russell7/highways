import { listOptions, type AnyOption, type Step, type Strategy } from "@mark1russell7/highways";

/** An option that a control can set: a number, a whole number, a boolean or a value of a list. */
export type ControlOption = Extract<AnyOption, { readonly type: "number" | "integer" | "boolean" | "enum" }>;

/** This function tells if a control can set an option: the declaration has a type with a range or a list of values. */
export const isControl = (d: AnyOption): d is ControlOption => d.type === "number" || d.type === "integer" || d.type === "boolean" || d.type === "enum";

/** One option of a strategy that a control can set, with its default value. */
export interface ControlEntry {
  readonly key: string;
  readonly declaration: ControlOption;
  readonly value: unknown;
}

/** One option of a strategy without a range: a rule, a strategy, a list or an object. The pages show its default value as text. */
export interface TextEntry {
  readonly key: string;
  readonly describe: string;
  /** The default value, as text. */
  readonly text: string;
}

/** This function gives the options of a strategy that a control can set, with the default value of each one. */
export function controlOptions(strategy: Strategy<Step, object>): ControlEntry[] {
  return listOptions(strategy).filter((o): o is typeof o & { declaration: ControlOption } => isControl(o.declaration));
}

/** This function writes the default value of an option without a range as short text. */
export function optionText(value: unknown): string {
  if (value === undefined) return "none";
  if (typeof value === "function") return "a rule";
  if (Array.isArray(value)) return value.length === 0 ? "an empty list" : `a list of ${value.length}`;
  if (typeof value === "object" && value !== null && "step" in value && "name" in value) return String((value as { name: unknown }).name);
  if (typeof value === "object" && value !== null) {
    const text = JSON.stringify(value);
    return text.length > 40 ? `${text.slice(0, 39)}…` : text;
  }
  return String(value);
}

/** This function gives the options of a strategy that no control can set, with the default value of each one as text. */
export function textOptions(strategy: Strategy<Step, object>): TextEntry[] {
  return listOptions(strategy)
    .filter((o) => !isControl(o.declaration))
    .map((o) => ({ key: o.key, describe: o.declaration.describe, text: optionText(o.value) }));
}

/** This function reads one option value from text. It gives `undefined` for text that does not fit the declaration. */
export function readValue(text: string, d: ControlOption): number | boolean | string | undefined {
  if (d.type === "boolean") return text === "true" ? true : text === "false" ? false : undefined;
  if (d.type === "enum") return d.values.includes(text) ? text : undefined;
  const v = Number(text);
  return Number.isNaN(v) || text.trim() === "" ? undefined : v;
}
