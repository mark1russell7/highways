# The dense board of ROUTE-SCALE

The file `route-scale-fixture.json.gz` is the input of the times script `scripts/scale.ts`. The workflow `Scale` routes it with each router.

- The file comes from the joint bench of layout-contract, CI run 40701315669, artifact `route-scale-fixture`.
- The data is synthetic. The bench made it from the seed s2 of the spec `n1000.e-dense`.
- The file has `{ manifestId, pack, env, graph }`. `graph` is the packed input of the pack `maxrects-cp`: 1000 boxes, 4000 edges and no obstacles.
- `env` names the versions that made the file: node 26, `highways` 0.7.0 and `packing` 0.2.13.

The research note `docs/research/SCALE.md` gives the times and the route hash of each router.

The job `screen` of the workflow `Scale` runs the router screen of the base commit and of the head in turn on one runner. The script `scripts/scale-screen.ts` compares their records and their times.
