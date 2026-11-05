// Probe of THROUGH-FLOOR, kept on a measure branch. It reads if `seams` and the two walkers give the same bytes on `packed-grid`, because the record reads one length for the three.
import { highwaysRegistry } from "../src/families/index.ts";
import { ROUTERS, seamsRouter } from "../src/routers/index.ts";
import { routerNamed } from "./control-wins-rows.ts";

const reg = highwaysRegistry();
const named = (name: string) => (name === "seams" ? seamsRouter({ name }) : (ROUTERS.find((r) => r.name === name) ?? routerNamed(name)));
const names = ["seams", "border-walk", "border-walk-short"];
for (const family of ["packed-grid", "maze", "rows"]) {
  for (const seed of [0, 1]) {
    let board;
    try {
      board = reg.generate(family, seed).graph;
    } catch {
      continue;
    }
    const lines = names.map((n) => new Map(named(n).route(board).routes.map((r) => [r.edge, JSON.stringify(r.points)])));
    const differ = (a: number, b: number): number => [...lines[a]!].filter(([id, t]) => lines[b]!.get(id) !== t).length;
    console.log(family, seed, "routes", lines[0]!.size, "seams/walk", differ(0, 1), "seams/short", differ(0, 2), "walk/short", differ(1, 2), "names", names.map((n) => named(n).name).join(","));
    console.log(" e0", [...lines[0]!.values()][0]!.slice(0, 160));
  }
}
