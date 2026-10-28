# The layout inputs and the run records

This document gives the input format and the record format of the screen of `highways`. The packer `packing` uses the same formats. Its twin document is [`docs/FORMAT.md`](https://github.com/mark1russell7/packing/blob/main/docs/FORMAT.md) in `mark1russell7/packing`, from commit `776261d`. Change both documents together.

One input file feeds the two stages. A joint run packs an input, and then routes the edges of the same input.

## The input: `layout-input/1`

The corpus is a folder of input files and a manifest `corpus.json`. Each input is one JSON file. The screen set `screen-v1` is in [`corpus/screen-v1`](../corpus/screen-v1). The command `pnpm --filter @mark1russell7/highways screen:inputs` writes the files again from `screenInputs`.

```json
{
  "schema": "layout-input/1",
  "id": "screen-v1/small-clustered/s0",
  "set": "screen-v1",
  "family": "small-clustered",
  "seed": 0,
  "source": "made-up",
  "generator": { "name": "fixture", "version": 1, "params": { "kind": "clustered", "nodes": 100, "edgesPerNode": 2, "fixedPorts": 0.2 }, "seed": 2 },
  "cell": { "edgeDensity": "medium", "edgeShape": "clustered", "groups": "none", "ports": "fixed" },
  "hash": "338f200730d53b48",
  "boxes": [
    { "id": "n0", "w": 35, "h": 23, "x": 151, "y": 422 },
    { "id": "n4", "w": 44, "h": 27, "x": 61, "y": 402, "ports": [{ "id": "out", "side": "top", "x": 17, "y": 0 }] }
  ],
  "edges": [{ "id": "e0", "source": "n4", "target": "n0", "sourcePort": "out", "data": { "collection": "users" } }]
}
```

| Field | Use |
|---|---|
| `id`, `set`, `family`, `seed` | The name of the input. The `id` is `<set>/<family>/s<seed>`. The `set` is the corpus version, for example `screen-v1`. |
| `source` | The origin of the input: `made-up`, `published:<set>` or `known-best:<construction>`. The inputs of this repository are `made-up`, because the repository is public. |
| `generator` | The generator of the input: `name`, `version`, `params` and `seed`. A hand-made input has `null`. Refer to [The generators](#the-generators-layout-corpus1). |
| `cell` | The cell of the input in the taxonomy. Refer to [The cells](#the-cells). |
| `hash` | The first 16 hex characters of the SHA-256 of the canonical file. Refer to [The hash](#the-hash). |
| `container` | The outer rectangle: `w`, `h`, `fixed`, `aspect` and `shape`. `fixed` is `none`, `width`, `height` or `size`. `aspect` is the target `w / h`. The router ignores it. |
| `gap` | The free space between two boxes with their margins. The routes use it. The router ignores the value. |
| `container.inset` | The space between the border and the boxes with their margins. The router ignores it. |
| `obstacles` | The areas that the boxes and the routes must not use. Each one has an `id`, a `region` and a `move` with a `cost`. Refer to [Regions](#regions). |
| `boxes[].w`, `boxes[].h` | The size of a box. The packer reads them. The router uses them as the bounding box of the box. |
| `boxes[].x`, `boxes[].y` | The position of the top-left corner. The packer writes them. The router reads them. A box without a position is an error for the router. |
| `boxes[].locked` | The value `true` makes the box an obstacle for the packer: its `x` and `y` stay. `false` is the same as no value. The router ignores it. |
| `boxes[].rank` | The reading order that the caller wants. The router ignores it. |
| `boxes[].parent`, `boxes[].group` | The nesting and the grouping. |
| `boxes[].margin` | A ring around the box: a number, or `top`, `right`, `bottom` and `left`. No box enters it. A route enters it only at a plug stub, at a right angle. The default is 0. The router reads it after MARGIN-BOX. Until then, the router uses its option `margin` for each box. |
| `boxes[].turnable` | The value `true` lets the packer turn the box by 90 degrees. The record holds the turned box and the turned ports, so the router does not see a turn. |
| `boxes[].shape` | The shape of the box, as a region relative to the top-left corner of the box. The router ignores it. |
| `boxes[].ports` | The ports of a box. Each port has an `id` and a `side`: `top`, `right`, `bottom` or `left`. |
| `boxes[].ports[].x`, `boxes[].ports[].y` | The fixed place of a port, relative to the top-left corner of the box. The router does not move such a port. The `side` is the side that holds it. |
| `boxes[].data` | The free data of the node. The grouping rule `keys` reads `data.group`. |
| `edges[]` | The `id`, the box ids `source` and `target`, the port ids `sourcePort` and `targetPort`, and `data`. |
| `base`, `change`, `step` | A variant names its base input and its change: `add`, `remove`, `resize`, `reorder` or `packed`. `step` is its place in a change sequence. The stability measures compare the run on the variant with the run on its base. |

The fields `x` and `y` of a port are an addition of `highways`, because the fixtures of the benchmark have fixed plugs. Without `x`, `y` and `side`, the router picks the side of a port.

### Regions

A region is an area of the plane. The y axis points down.

| Kind | Fields |
|---|---|
| `rect` | `x`, `y`, `w`, `h` |
| `polygon` | `points`: a ring of `[x, y]` points. `holes`: a list of rings. |
| `circle` | `cx`, `cy`, `r` |
| `ellipse` | `cx`, `cy`, `rx`, `ry` |

A ring closes itself: its last point joins its first point. A hole does not touch the outer ring.

The router does not use the shapes yet. It treats each obstacle as a no-go area: a box without edges, with the bounding box of its region. It ignores `move`.

### The hash

The `hash` of an input is the first 16 hex characters of the SHA-256 of its canonical JSON. The canonical JSON has the keys of each object in sorted order and no whitespace. It does not include the field `hash`. `documentHash` calculates it. A test keeps the hash of a known input fixed.

## The generators: `layout-corpus/1`

The corpus comes from seeded generators. The same generator, version, parameters and seed give the same file, byte for byte, in `packing` and in `highways`.

- Each generated input has `"generator": { "name", "version", "params", "seed" }`. A hand-made or published input has `"generator": null`.
- A generator is a pipeline of steps. For the packer: the container, the obstacles, then the sizes and the count. The router adds the positions and the edges.
- The random numbers come from `mulberry32`. Each step has its own seed: `fnv1a32("<input seed>:<step name>")` of the UTF-8 bytes. `stepSeed` calculates it.
- Each number in a file is a JSON number, rounded to 3 decimals. `round3` rounds it, and `-0` becomes `0`.
- A routing input needs positions. Either its generator gives positions, or it names a packing input in `base` with `"change": "packed"`. Then it routes the packed output of that input.

The generators of `screen-v1` wrap the fixtures and the case boards of the benchmark: `fixture`, `case.hub-chain`, `case.many-groups` and `case.packed-grid`, all version 1. Their output does not change. Their own random numbers do not use `mulberry32` yet.

The manifest of a corpus is `corpus.json`. `corpusManifest` writes it.

```json
{
  "schema": "layout-corpus/1",
  "corpus": "screen-v1",
  "specs": [{ "generator": "fixture", "version": 1, "params": { "kind": "uniform", "nodes": 10, "edgesPerNode": 1.5 }, "seeds": [1, 1010, 2019] }],
  "inputs": [{ "id": "screen-v1/tiny-uniform/s0", "hash": "979d6f758b35b32e", "cell": { "edgeShape": "random", "ports": "free" } }]
}
```

### The cells

`cell` names the cell of an input in the taxonomy, with one value for each dimension. The coverage of a corpus comes from these cells.

| Dimension | Values |
|---|---|
| `containerSize` | `fixed`, `freeHeight`, `freeWidth`, `freeAspect`, `freeArea` |
| `containerShape` | `rect`, `convex`, `polygon`, `circle`, `ellipse`, `holes` |
| `obstacles` | `none`, `center`, `scattered`, `wall`, `corridors`, `touching`, `edge` |
| `sizes` | `identical`, `uniform`, `heavyTail`, `bimodal`, `extremeAspect`, `nearIdentical` |
| `count` | `1`, `10`, `100`, `1k`, `10k` |
| `mode` | `offline`, `online`, `incremental` |
| `edgeDensity` (routing) | `sparse`, `medium`, `dense`: approximately 0.5, 1.5 and 4 edges for each box |
| `edgeShape` (routing) | `random`, `clustered`, `hubChain`, `longRange`, `tree`, `bundled` |
| `groups` (routing) | `none`, `flat`, `nested` |
| `ports` (routing) | `free`, `sides`, `fixed` |

No input of `screen-v1` declares groups, thus each one has `groups` set to `none`. The clusters of the positions show in `edgeShape`.

### The shared generator `rect-scattered`

The two repositories check their pipelines with one shared generator. `rectScattered` makes it. Packing gives its steps in its `FORMAT.md`. A test pins these hashes for `{ "count": 40 }`:

| Seed | Container | Obstacles | `hash` |
|---|---|---:|---|
| 1 | 970 by 705 | 4 | `f5f5c51d1560e41c` |
| 2 | 733 by 437 | 7 | `cfd6ef0ef232aaa3` |
| 3 | 871 by 554 | 8 | `d1638f2406360b2e` |

The check value of the step seed: `fnv1a32("1:container")` is `3139901265`.

## The record: `layout-record/1`

Each run writes one line of JSON Lines: one line for each strategy, input and seed. `screen` gives the records, and `recordLines` writes them.

```json
{
  "schema": "layout-record/1",
  "stage": "route",
  "step": "router",
  "strategy": "corners",
  "options": {},
  "corpus": "screen-v1",
  "input": "screen-v1/tiny-uniform/s0",
  "inputHash": "979d6f758b35b32e",
  "set": "screen-v1",
  "seed": 0,
  "nodes": 10,
  "edges": 15,
  "measures": { "route.crossings": 8, "route.detour.median": 1.029 },
  "hard": { "complete": 0, "no-pass-through": 0, "same-twice": 0 },
  "tolerance": { "through": 0.5 },
  "deterministic": true,
  "prediction": "p-2026-10-27-corners",
  "ms": 1.8,
  "commit": "3fce85d"
}
```

- `stage` is `pack`, `route` or `joint`. The screen of `highways` writes `route`.
- `step` is the step of the strategy: `router`, `highway`, `curve` or `group`. The screen of the step `highway` also writes the records of the base routers, with the step `router`.
- `options` holds the defaults of the strategy with the options of the call. A function is the text `function:<name>`.
- `corpus` and `set` name the screen set. `inputHash` is the `hash` of the input file. Thus a result stays comparable after the corpus grows.
- `nodes` counts the boxes and the obstacles of the input.
- `measures` holds the measures of the table below. A measure without a finite value is not in the record.
- `hard` counts the breaks of each hard rule. A good run has 0 for each rule.
- `tolerance` gives the tolerance of each hard rule of the run. It is a field next to `hard`, so `hard` holds only counts. The defaults are `overlap` 0.001 and `through` 0.5. A record of a packer writes `overlap`, and a record of a router writes `through`.
- `deterministic` is `true` when two runs of the same input give the same output. The screen runs each input two times.
- `ms` is the time of the run. It is not a measure. Only the times of CI compare.
- `skipped` gives the reason when a strategy did not run, for example an input over its `maxNodes`. Then the record has no measures.

### The hard rules of the router

| Step | Rules |
|---|---|
| `router` | `complete`, `ends-at-plugs`, `fixed-plugs`, `no-pass-through`, `counts-sum`, `link-ends`, `bundle-trunk`, `run-shared`, `same-twice` |
| `highway` | The rules of `router`, on the routes of `follow` |
| `group` | `sections`, `counts-sum`, `link-ends`, `same-twice` |
| `curve` | `same-twice` |

The rules `no-pass-through` and the overlap of boxes use a tolerance of 0.5 units, `TOLERANCE` in `bench/properties.ts`. A segment goes through a box when a part of it longer than 0.5 is inside the box made smaller by 0.5. Two boxes with a common edge do not overlap. The geometry of the levels uses `1e-6`. A route can not go between two boxes with a common edge. Thus the boxes of a packed input break `no-pass-through` when an edge must pass between them.

The packer is exact, so the shared rule `no-overlap` uses the smaller tolerance 0.001. A route is a curve on the line of the margin, so the rule `through` uses 0.5. A route in the margin of a box, outside the box, is a soft measure, not a break. The joint corpus keeps the packed inputs with a gap of 0 and no margin as a stress cell. On them, the rule `through` is expected to break. Each other joint input has a margin and a gap larger than 0.

The [measure note](research/MEASURES.md) tells each rule. The rule `sections` counts a tree that the router refuses. The proposed rules of MEAS0 are measures: `route.curve.rule.*` and `route.level.nesting`.

### The hard rules of the packer

A record of a packer counts the breaks of `no-overlap`, `in-container`, `locked-kept` and `complete`. The `FORMAT.md` file of `packing` defines them. They follow `layout-contract` 0.2.0:

- A locked box without a placement breaks only `locked-kept`. It does not break `complete`. It stays at its input position for `no-overlap` and `in-container`.
- A locked box moves when a coordinate changes by more than `RECORD_EPS`.
- A locked box without a position in the input is a bad input, not a break. `checkInput` of the contract refuses it.

## The shared contract

The package `@mark1russell7/layout-contract` holds the shared types of the two formats, the turn rule, the tolerances and the hard rules of the packer. The core has version 0.2.1 from npm as a development dependency. The core has no run-time dependency, so it keeps its own copy of each shared constant, and the test compares the two values. The test `bench/screen/contract.test.ts` examines the fit of the types of `forms.ts` to the types of the contract. It also examines the `screen-v1` inputs and a record with the rules of the contract, and it compares `TOLERANCE` with `DEFAULT_TOLERANCE.through`.

The test also checks that [the floors](PROMOTION.md#the-floors) has no row of a `joint.*` or a `pack.*` measure. `JOINT_MEASURES` of the contract and `MEASURE_SPECS` of `packing` give these floors.

`inputGraph` reads only the fields of `RouteInput`: `id`, `boxes`, `obstacles` and `edges`. Thus a contract input, for example the result of `applyPack`, goes to the router.

Each open gap has a `@ts-expect-error` with its id. When a gap closes, `pnpm typecheck` fails. Then remove the directive, and mark the gap as closed.

| Id | Gap | Direction | Status |
|---|---|---|---|
| G1 | The `side` of a port is optional in `highways`, because the router picks a side. The contract needs a `side`. | `highways` to the contract | Closed by the contract 0.2.0: `side` is optional. |
| G2 | A router input has no `container`. The contract needs one. | `highways` to the contract | Closed by the contract 0.2.0: `container` is optional, and `toPackInput` gives `{ fixed: "none" }`. |
| G3 | The change `packed` is not in the contract. | `highways` to the contract | Closed by the contract 0.2.0. |
| G4 | `locked` is a boolean in the contract and only `true` in `highways`. | The contract to `highways` | Closed: `locked` is a boolean in `highways`. |
| G5 | `set`, `family`, `seed`, `source`, `hash` and `edges` are optional in the contract. `inputGraph` needs them. | The contract to `highways` | Closed: `inputGraph` takes a `RouteInput`. |
| G6 | `ms` is optional in a contract record. `highways` needs it. | The contract to `highways` | Closed by the contract 0.2.0: `ms` is necessary. |
| G7 | `highways` has no `margin` or `turnable` on a box, and no `inset` or `aspectWeight` on a container. | The contract to `highways` | Open, until the item MARGIN-BOX. |
| G8 | The contract has no `data` on a box, no `generator`, `cell` or `step` on an input, and no `skipped` on a record. | `highways` to the contract | Closed by the contract 0.2.0. The `containerSize` values of `highways` are the values of the contract. |
| G9 | `highways` has no constant for the epsilon of a file. `round3` rounds to 0.001, the value of `RECORD_EPS`. | Both | Closed: `RECORD_EPS` of `bench/screen/hash.ts` has the value of the contract, and the test compares them. |

## The predictions

Each prediction is written before its run. The predictions are a JSON Lines file, and a commit adds it before the run starts.

```json
{ "schema": "layout-prediction/1", "id": "p-2026-10-27-corners", "strategy": "corners", "set": "screen-v1", "input": "screen-v1/tiny-uniform/s0", "measure": "route.crossings", "expected": 8, "op": "<=", "reason": "The same board as before." }
```

- A prediction without `input` is about the median of the measure over the set.
- Without `op`, a measure where lower is better gets `<=`, and the other measures get `>=`.
- A record names the first prediction with its strategy, its set and its input in `prediction`.
- The summary of the screen gives each prediction with the measured value, and tells if the value meets it.

## The measures of the router

The names are lowercase, with a dot after the stage. `MEASURES` exports this table. The key is the key in the values of `runSuite` and `compareStep`.

The column "Placement" tells if the positions of the boxes alone move the value, with the same router.

- "yes": the value compares only between runs on the same input. The crossings, the clearance and the groups of the far view are examples.
- "no": the measure scores the routes or the curves for a fixed placement. A joint harness can compare the value between placements.

| Name | MEAS0 | Key | Unit | Better | Placement |
|---|---|---|---|---|---|
| `route.crossings` | R1 | `R1.crossings` | count | lower | yes |
| `route.crossings.per-edge` | R1 | `R1.perEdge` | count for each edge | lower | yes |
| `route.crossing-angle.mean` | R2 | `R2.angle` | 0 to 1 | higher | yes |
| `route.crossing-angle.min` | R2 | `R2.min` | degrees | higher | yes |
| `route.bends` | R3 | `R3.bends` | count for each route | lower | no |
| `route.turn.mean` | R4 | `R4.turn` | half turns for each route | lower | no |
| `route.turn.max` | R4 | `R4.max` | degrees | lower | no |
| `route.detour.median` | R5 | `R5.median` | ratio | lower | no |
| `route.detour.q95` | R5 | `R5.q95` | ratio | lower | no |
| `route.detour.mean` | R5 | `R5.mean` | ratio | lower | no |
| `route.detour.max` | R6 | `R6.worstDetour` | ratio | lower | no |
| `route.backtrack` | R7 | `R7.backtrack` | 0 to 1 | lower | no |
| `route.clearance.mean` | R8 | `R8.clearance` | units | higher | yes |
| `route.clearance.tight` | R8 | `R8.tight` | 0 to 1 | lower | yes |
| `route.through` | R9 | `R9.through` | count | lower | yes |
| `route.plug-angle` | R10 | `R10.plugAngle` | degrees | lower | no |
| `route.plug-spacing.min` | R11 | `R11.min` | 0 to 1 | higher | yes |
| `route.plug-spacing.q05` | R11 | `R11.q05` | 0 to 1 | higher | yes |
| `route.outside` | R13 | `R13.outside` | count | lower | no |
| `route.inflections` | R15 | `R15.inflections` | count for each route | lower | no |
| `route.lane.separation` | R12 | `R12.share` | 0 to 1 | lower | yes |
| `route.orthogonality` | R14 | `R14.share` | 0 to 1 | higher | no |
| `route.ink` | R1 | `ink` | units | lower | yes |
| `route.bundle.ink-saved` | B1 | `B1.inkSaved` | 0 to 1 | higher | no |
| `route.bundle.ambiguity` | B4 | `B4.ambiguity` | 0 to 1 | lower | no |
| `route.bundle.share` | B2 | `B2.share` | 0 to 1 | higher | no |
| `route.bundle.stretch.median` | B3 | `B3.median` | ratio | lower | no |
| `route.bundle.stretch.q95` | B3 | `B3.q95` | ratio | lower | no |
| `route.bundle.merge-angle.max` | B6 | `B6.max` | degrees | lower | no |
| `route.bundle.lane-crossings` | B5 | `B5.crossings` | count | lower | no |
| `route.bundle.occupied-area` | B7 | `B7.ratio` | ratio | lower | no |
| `route.bundle.runs` | B8 | `B8.runs` | count | lower | no |
| `route.bundle.run-edges.median` | B8 | `B8.median` | count | higher | no |
| `route.bundle.run-edges.max` | B8 | `B8.max` | count | higher | no |
| `route.bundle.stretch.max` | B3 | `B3.max` | ratio | lower | no |
| `route.bundle.stretch.model.max` | B3 | `gap.stretch` | ratio | lower | no |
| `route.bundle.gap-closed` | B10 | `gap` | share of the gap | higher | no |
| `route.bundle.gap-closed.cap` | B10 | `gap.cap` | ratio | lower | no |
| `route.bundle.gap-closed.mixed` | B10 | `gap.mixed` | 0 or 1 | lower | no |
| `route.bundle.gap-closed.collection` | B10 | `gap.collection` | share of the gap | higher | no |
| `route.bundle.gap-closed.cap.collection` | B10 | `gap.cap.collection` | ratio | lower | no |
| `route.bundle.gap-closed.all` | B10 | `gap.all` | share of the gap | higher | no |
| `route.bundle.gap-closed.cap.all` | B10 | `gap.cap.all` | ratio | lower | no |
| `route.bundle.lane-fidelity.median` | B9 | `B9.median` | ratio | lower | no |
| `route.bundle.lane-fidelity.max` | B9 | `B9.max` | ratio | lower | no |
| `route.lane.area` | M1 | `M1.area` | ratio | lower | no |
| `route.lane.through` | M4 | `M4.laneThrough` | count | lower | yes |
| `route.order.crossings` | W3 | `W3.crossings` | IQR over the median | lower | yes |
| `route.order.detour` | W3 | `W3.detour` | IQR over the median | lower | yes |
| `route.order.ink-saved` | W3 | `W3.inkSaved` | IQR over the median | lower | yes |
| `route.order.ink` | W3 | `W3.ink` | IQR over the median | lower | yes |
| `route.order.changed` | W3 | `W3.changed` | 0 to 1 | lower | yes |
| `route.order.poa` | W3 | `W3.poa` | ratio | lower | yes |
| `route.stability.mean` | Z10 | `Z10.mean` | units of the board | lower | no |
| `route.stability.max` | Z10 | `Z10.max` | units of the board | lower | no |
| `route.stability.moved` | Z10 | `Z10.moved` | 0 to 1 | lower | no |
| `route.stability.base.mean` | Z10 | `Z10.base.mean` | units of the board | lower | no |
| `route.stability.base.max` | Z10 | `Z10.base.max` | units of the board | lower | no |
| `route.stability.base.moved` | Z10 | `Z10.base.moved` | 0 to 1 | lower | no |
| `route.stability.edits.mean` | Z10 | `Z10.edits.mean` | units of the board | lower | no |
| `route.stability.edits.moved` | Z10 | `Z10.edits.moved` | 0 to 1 | lower | no |
| `route.stability.highway-churn` | Z10 | `Z10.churn` | 0 to 1 | lower | no |
| `route.stability.highway-ids` | Z10 | `Z10.ids` | 0 to 1 | higher | no |
| `route.level.nesting` | Z6 | `level-nesting` | count | lower | no |
| `route.level.link-ends` | Z2 | `Z2.linkEnds` | count | lower | no |
| `route.level.link-agreement` | Z9 | `Z9.mean` | no unit | lower | yes |
| `route.level.through` | Z3 | `Z3.through` | count | lower | yes |
| `route.level.link-length` | Z3 | `Z3.length` | units | lower | yes |
| `route.level.far-items` | Z4 | `Z4.farItems` | count | lower | yes |
| `route.level.position` | Z7 | `Z7.position` | no unit | lower | yes |
| `route.level.order` | Z8 | `Z8.order` | -1 to 1 | higher | yes |
| `route.group.modularity` | G1 | `G1.modularity` | -0.5 to 1 | higher | yes |
| `route.group.cut` | G2 | `G2.cut` | 0 to 1 | lower | yes |
| `route.group.balance` | G6 | `G6.balance` | 0 to 1 | higher | yes |
| `route.group.tree-cost` | G8 | `G8.treeCost` | 0 to 1 | lower | yes |
| `route.group.stability` | G9 | `G9.ari` | -1 to 1 | higher | yes |
| `route.curve.c1.max` | C1 | `C1.max` | degrees | lower | no |
| `route.curve.c1.share` | C1 | `C1.share` | 0 to 1 | lower | no |
| `route.curve.c2.median` | C2 | `C2.median` | no unit | lower | no |
| `route.curve.c2.max` | C2 | `C2.max` | no unit | lower | no |
| `route.curve.c3.median` | C3 | `C3.median` | no unit | lower | no |
| `route.curve.c3.q95` | C3 | `C3.q95` | no unit | lower | no |
| `route.curve.c5.peak` | C5 | `C5.peak` | curvature times the unit of the board | lower | no |
| `route.curve.c6.length` | C6 | `C6.length` | ratio | lower | no |
| `route.curve.rule.clear` | C7 | `curve-clear` | count | lower | no |
| `route.curve.rule.ends` | C10 | `curve-ends` | count | lower | no |
| `route.curve.rule.g1` | C1 | `curve-g1` | count | lower | no |
| `route.curve.rule.simple` | C9 | `curve-simple` | count | lower | no |

`route.stability.*` compares the routes after the small change of `changeGraph`. `route.stability.base.*` compares the routes of a variant with the routes of its base input.

The screen adds the bundle measures for each router record:

- `route.bundle.share` (B2) is the share of the edges that share a way. Such an edge is in a run, in a bundle of two edges or more, or on a shared segment.
- `route.bundle.stretch.*` (B3) is the length of each route divided by the length of the route of `corners` on the same input. The record gives the median and the `0.95` quantile.
- `route.bundle.merge-angle.max` (B6) is the largest turn of a route where it joins or leaves a shared segment, in degrees.

Since MEAS3A, the screen also adds these measures for each record of the steps `router` and `highway`. `docs/research/MEASURES.md` gives the exact forms.

- `route.lane.separation` (R12) is the share of the ink within 4 units of a parallel leg of another edge.
- `route.orthogonality` (R14) is the share of the length on legs within 1° of an axis.
- `route.bundle.lane-crossings` (B5) counts the pairs of edges whose lane order flips from one shared segment to the next.
- `route.bundle.occupied-area` (B7) divides the grid cells that the routes touch by the cells that straight lines touch.
- `route.bundle.runs` and `route.bundle.run-edges.*` (B8) give the shared segments, and the median and the most edges of each.
- `route.bundle.lane-fidelity.*` (B9) divides the Fréchet distance of each lane and its route by half the width of its run.
- `route.lane.area` (M1) and `route.lane.through` (M4) open the lanes of the result at the width 4, without `openGaps`.
- The suite keeps its own `M1.area` and `M4.laneThrough` of the room step.
- `route.level.link-ends` (Z2) is the count of the hard rule `link-ends`. The steps `router`, `highway` and `group` write it.
- `route.level.link-agreement` (Z9) is the mean Hausdorff distance of each link to the routes of its edges, in units of the board. It needs zoom levels.

`route.order.*` (W3 of MEAS3) is the order fragility of WILD-056. The screen writes it only with the option `shuffles`.

- The screen routes the input again in `shuffles` random orders of the edges.
- Each spread is the interquartile range over the median. A value of 0 is a router that the order of the edges does not move.
- `route.order.changed` is the share of the orders that change one route or more.
- `route.order.poa` is the crossings of the input order divided by the fewest crossings of the random orders.

`route.stability.edits.*` and `route.stability.highway-*` measure a highway strategy over a sequence of edits (BUILD-W2A). The screen writes them only with the option `edits`.

- `highwayEdits` makes `edits` seeded small changes of `changeGraph`, one after the other. The strategy gets the graph and its plan before each edit as `previous`.
- `route.stability.edits.mean` and `route.stability.edits.moved` are the mean Z10 over the edits.
- `route.stability.highway-churn` is the share of the pairs of edges on one highway that come or go over one edit. Only the edges of both graphs count.
- `route.stability.highway-ids` is the share of the matched highways that keep their id over one edit. Two highways match when the Jaccard index of their edges is 0.5 or more.

## The measures of the packer

The packer measures are the measures of `packing`. Its [measure note](https://github.com/mark1russell7/packing/blob/main/docs/MEASURES.md) is the source. This table is a copy for the joint harness.

| Name | Unit | Better | Where |
|---|---|---|---|
| `pack.area` | square units of the input | lower | each input |
| `pack.fill` | 0 to 1 | higher | each input |
| `pack.aspectError` | 0 or more | lower | each input |
| `pack.order.inversions` | 0 to 1 | lower | each input |
| `pack.overflow` | count | lower | fixed cells |
| `pack.stability.mean` | 0 or more, in container widths | lower | change pairs |
| `pack.stability.q95` | 0 or more, in container widths | lower | change pairs |
| `pack.stability.moved` | 0 to 1 | lower | change pairs |
| `pack.deterministic` | true or false | true | each input |
| `pack.search.ms` | milliseconds | lower | each input |

- `pack.area` is the area of the hull of the placed boxes, not the area of the container. A free container has no fixed size.
- `pack.order.inversions` divides the inverted pairs by the pairs with different ranks. Without ranks, the value is the same as before.
- `pack.stability.mean` is the mean move of the items that stay, divided by the container width. A vertical move can be longer than the width, so the value can be more than 1.
- `pack.stability.q95` is the q0.95 move of the items that stay, divided by the container width.
- `pack.overflow` counts the items outside the container in a cell with a fixed container.
- `MEASURE_SPECS` of `packing` 0.1.7 gives the floor and the tolerance of each guard. The promotion rule uses them.

## The screen

`screen(step, strategies, options)` runs strategies of one step on each input of a screen set. It gives the records and a summary.

- A strategy is a name of the registry or a strategy object. Thus a prototype file can export a strategy, and the registry does not change.
- By default, the screen also runs the built-in strategies of the step. The summary gives the median of each measure, the sum of each hard rule and the Pareto front over the medians.
- The floor of an input is the counts of the hard rules of the built-in strategy with the fewest breaks on that input. On `packed-grid`, the boxes touch, thus each router goes through boxes.
- A strategy with a break over the floor, or with two different outputs of one input, does not enter the front.
- The step `highway` makes the plan of each strategy and routes it with `follow`. The routers of `baseRouters` run too: `corners`, `shared` and `trunks` by default.
- The option `wrap` adds a wrapped copy of each router as a new strategy. `stable` routes the edges in a stable order of their ids (WILD-053). `repair` runs the repair step of RULE-046 after the router.
- The option `shuffles` measures the order fragility of each router. Each router routes each input `shuffles` times more.
- The option `edits` measures each highway strategy over `edits` seeded edits of each input. The base routers do not get these measures.

The script `packages/core/scripts/screen.ts` writes `screen.jsonl` and `screen.md`:

```sh
pnpm --filter @mark1russell7/highways screen --step router --module ./proto/my-router.ts --out screen.jsonl --summary screen.md
```

The workflow `Screen` runs the screen in CI and keeps the two files as an artifact. Start it from the Actions tab with a step, names or prototype files.
The inputs `wrap`, `shuffles` and `edits` set the wrappers, the number of random orders and the number of edits. The input `minutes` sets the time limit of the job.

```sh
gh workflow run screen.yml --ref main -f step=router -f wrap=stable -f shuffles=20 -f minutes=60
```

### The screen set `screen-v1`

| Family | Seeds | Nodes | Hard case |
|---|---:|---:|---|
| `tiny-uniform` | 3 | 10 | A tiny board: the cost of a strategy at its start. |
| `small-clustered` | 3 | 100 | Clusters, and fixed plugs on 20% of the nodes. |
| `dense-groups` | 3 | 150 | Dense groups whose boxes overlap at the far view. |
| `hub-chain` | 1 | 96 | A chain of hubs: routes climb away from their targets. |
| `many-groups` | 1 | 128 | Many groups: level links go around the board. |
| `packed-grid` | 3 | 96 | A packed grid: boxes touch, with no channel for the routes. |

The seed 0 of each family is the fixture or the case board of the benchmark. The set does not change. A new board or a changed board gets a new set id.
