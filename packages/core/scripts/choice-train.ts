// The table of the whole strategy `choice` (WILD-046): `node scripts/choice-train.ts [--seeds 2] [--out src/whole/choice/table.ts]`.
// The script makes boards of each family of `HIGHWAYS_FAMILIES` with seeds outside the screen sets, from 100 000.
// On each board, it runs `board-portfolio` with its defaults, and keeps the features of the board and the name of the winner.
// It reads no record of a screen. The same seeds give the same table.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HIGHWAYS_FAMILIES, highwaysRegistry } from "../src/families/index.ts";
import { BOARD_PORTFOLIO_SETTINGS } from "../src/strategies/builtins.ts";
import { boardFeatures, type ChoiceRow } from "../src/whole/choice/index.ts";
import { BOARD_PORTFOLIO_DEFAULTS, boardPortfolio } from "../src/whole/portfolio/index.ts";

/** The first seed of the training boards. The seeds of the screen sets are below 10 000. */
export const TRAIN_SEED = 100_000;

const args = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1]! : fallback;
};
const seeds = Number(option("seeds", "2"));
const out = option("out", fileURLToPath(new URL("../src/whole/choice/table.ts", import.meta.url)));

const registry = highwaysRegistry();
const rows: ChoiceRow[] = [];
for (const family of HIGHWAYS_FAMILIES) {
  for (let k = 0; k < seeds; k++) {
    const seed = TRAIN_SEED + 7919 * k + rows.length;
    const graph = registry.generate(family.name, seed).graph;
    const run = boardPortfolio(graph, BOARD_PORTFOLIO_SETTINGS, BOARD_PORTFOLIO_DEFAULTS);
    const features = boardFeatures(graph).map((v) => Math.round(v * 1e4) / 1e4);
    rows.push({ board: `${family.name}/${seed}`, features, winner: run.pick });
    console.log(`${family.name} ${seed}: ${run.pick}`);
  }
}

const body = rows.map((r) => `  { board: ${JSON.stringify(r.board)}, features: ${JSON.stringify(r.features)}, winner: ${JSON.stringify(r.winner)} },`).join("\n");
writeFileSync(
  out,
  `// This file is made by \`node scripts/choice-train.ts --seeds ${seeds}\`. Do not edit it by hand.
import type { ChoiceRow } from "./index.ts";

/**
 * The table of the whole strategy \`choice\` (WILD-046): the features of made-up boards and the winner of \`board-portfolio\` with its defaults on each one.
 * The boards are the families of \`HIGHWAYS_FAMILIES\` with seeds from ${TRAIN_SEED}, outside the screen sets. No record of a screen goes into it.
 */
export const CHOICE_TABLE: readonly ChoiceRow[] = Object.freeze([
${body}
]);
`,
);
console.log(`Wrote ${out}: ${rows.length} rows.`);
