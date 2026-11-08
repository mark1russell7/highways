// The second probe of UNMARKED-THROUGH: the contacts of `checkRoutes` that the field `through` does not name, with their depth and class.
// Start: `node scripts/probe-unmarked-depth.ts [seeds] [families]`. The output is one JSON row for each router.
import { checkRoutes } from "../src/bench/measures/through-check.ts";
import { highwaysRegistry } from "../src/families/index.ts";
import { getStrategy } from "../src/strategies/model.ts";
import { STRATEGIES } from "../src/strategies/builtins.ts";

const seeds = Number(process.argv[2] ?? 1);
const families = (process.argv[3] ?? "tiny-uniform,small-clustered,dense-groups,frame-rows,maze").split(",");
const reg = highwaysRegistry();
for (const name of ["straight", "plugs", "corners"]) {
  const router = getStrategy(STRATEGIES, "router", name);
  const depths: number[] = [];
  const classes: Record<string, number> = {};
  let [named, unnamed] = [0, 0];
  for (const family of families)
    for (let seed = 0; seed < seeds; seed++) {
      const { graph } = reg.generate(family, seed, {});
      for (const c of checkRoutes(graph, router.run(graph, router.defaults as never).routes))
        for (const k of c.contacts) {
          if (c.unnamed.includes(k.box) || !c.marked) {
            unnamed++;
            depths.push(k.depth);
            classes[k.class] = (classes[k.class] ?? 0) + 1;
          } else named++;
        }
    }
  depths.sort((a, b) => b - a);
  console.log(JSON.stringify({ router: name, seeds, families, named, unnamed, deepest: depths.slice(0, 5), classes }));
}
