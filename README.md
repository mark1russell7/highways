# highways

`highways` routes the edges of large graphs. It uses a hierarchy of highways, bundles and zoom levels.

The core is plain TypeScript. It knows no renderer. It takes boxes and edges, and it gives polylines and zoom levels.

## The idea

- A tree of sections divides the plane. Each section has a highway that bends around the nodes in it.
- A node goes onto the highway of its section by a ramp. A section goes onto the highway of its parent by a ramp.
- An edge goes up to the lowest common section, along its highway, and down again.
- When you zoom out, a section becomes one node, and its highway becomes one edge with a count. This repeats at each level.
- A grouping rule gives each edge a key. Edges with the same key share one plug and one bundle.
- A plug with a fixed place stays there. The router places each free plug.

## Status

| Step | Content | State |
|---|---|---|
| H0 | The repository, the benchmark, the fixtures and a straight-line control | Done |
| H1 | One region: plugs, routes around the nodes and the inflection rule | Next |
| H2 | Bundles by rule, ordered lanes and the data to unpack a bundle | Later |
| H3 | The tree of sections, the highways and the zoom levels | Later |
| H4 | A race of the strategies for each step | Later |
| H5 | Stability: an incremental mode and a full recompute | Later |

## The benchmark

`pnpm --filter @highways/core bench` races the routers on the fixtures and writes a Markdown table.

- `--max <nodes>` sets the largest fixture. The default is 1 000. The fixtures go from 10 to 100 000 nodes.
- `--json <file>` also writes the rows as JSON.

The workflow `Bench` races the routers on all the fixtures, to 100 000 nodes, in CI. It starts on each change of `packages/core` on `main`, or by hand. It writes the table to the summary of the run and keeps `bench.json` as an artifact.

Each router must obey the hard rules. A broken rule is a violation:

- Each edge has one route.
- Each route starts and ends at its nodes.
- A fixed plug stays in its place.
- No route goes through a node that is not one of its ends.
- At each zoom level, the counts of the links add up to the edges between the shown items.
- The same input gives the same result.

The benchmark also measures the quality of each result:

| Value | Meaning |
|---|---|
| ink | The length of all drawn lines. A shared segment counts one time. |
| crossings | The points where two drawn segments cross. Above 20 000 segments, this value is an estimate from a sample. |
| bends | The mean number of bends of a route. |
| inflections | The mean number of changes of the direction of the turn of a route. |
| clearance | The mean distance from a route to the nearest node that is not one of its ends. |
| tight | The share of the routes that come closer than 4 units to such a node. |
| detour | The mean ratio of the length of a route to the distance between its ends. |
| plug angle | The mean angle between the route and the normal of the side of its node, in degrees. |

`measureStability` compares two results of the same graph with the discrete Fréchet distance of each route.

## Packages

| Package | Content |
|---|---|
| `packages/core` | The geometry, the model, the fixtures, the routers and the benchmark |

## Development

- `pnpm install` installs the workspace.
- `pnpm test` starts the tests. `pnpm typecheck` checks the source and the tests.
- `pnpm lint:ste` examines the prose.
