# The sweep records

A sweep record holds the response curves of the strategy cards. Part 2 of the strategy cards (STRATEGY-CARDS) writes these records from the nightly sweep. The explorer page reads the same records.

## The format

Each file is one JSON record of the format `response-records/1` of `@mark1russell7/rigor-statistics`. `fitResponse` writes the record, and `parseResponseRecord` reads it. This folder adds two rules:

- The record has the categorical dimensions `step` and `strategy`. Each pair of a step and a strategy is one card.
- The categorical dimension `family` gives the family of the input of each point. A record from before SPACE-INPUTS does not have it.
- A dimension with its `when` on `family` is an input dimension, for example `input:tiny-uniform.nodes`. Only a drawn input has its values.
- Each other dimension is an option of the strategy, for example `gap`.

## The drawn inputs

A screen set has one value of each dimension of a family. Thus a fit cannot tell the effect of the size or the density of an input (SPACE-INPUTS).

- With `--draw <n>`, the sweep draws `n` inputs of each family. The workflow `Sweep` has the input `draw` for it.
- Each number dimension of a family gets a uniform fraction of its range, on the scale of the dimension. A dimension with a `when` keeps its default.
- The id of an input dimension is the id of the space, so `space-fits.ts` maps it with no table.
- A fit holds out whole inputs. With 10 inputs or more, it gets 10 folds.
- An input dimension gives no curve to a card. Only an option gives a curve.

## The count

The file `kpi.json` of the site has the measure `cards-with-curves`. It counts each card whose measured points have 2 or more values of one option. These records give no card:

- a file that `parseResponseRecord` refuses,
- a record with no dimensions `step` and `strategy`.

A card in two records counts once. The measure has the date of the latest commit of a record with a card.

## The share

The measure `cards-curve-share` of `kpi.json` gives the cards with a curve over the built-in strategies with a number option, in percent. The target is 100.

- The build reads the base from the registry `BUILT_IN_STRATEGIES`. Thus a new strategy with a number option lowers the share until its sweep.
- The share rounds down, so a gap of one card does not read 100.
- A card of a strategy that is not built in does not count.
- On 2026-11-07, 101 of the 107 built-in strategies have a number option. A test of `kpi.test.ts` holds that count.
- On 2026-11-08, the records of this folder give a curve to each of the 101 cards, so the share reads 100 %.
- The list `NO_CURVE` of `packages/site/src/kpi.ts` gives the 6 other strategies, each with its reason. A test holds the list against the registry.

## The source of each record

The format `response-records/1` refuses a field that it does not have. Thus a record cannot name its run, and this table names it.

| File | The workflow `Sweep` | Commit | Inputs |
|---|---|---|---|
| `router-screen-v1-sample.json` | [42424232256](https://github.com/mark1russell7/highways/actions/runs/42424232256) | `1db7ef7` | `corners`, `trunks` and `shared` on `tiny-uniform` and `small-clustered` |
| `highway-screen-v1-part-1.json` | [42429126987](https://github.com/mark1russell7/highways/actions/runs/42429126987) | `4c57061` | The first 22 highway strategies with a number option, from `keys` to `growth`, on `tiny-uniform` and `small-clustered`. It gives 22 cards. |
| `highway-screen-v1-part-2.json` | [42430144949](https://github.com/mark1russell7/highways/actions/runs/42430144949) | `06cb538` | The next 22 highway strategies with a number option, from `edge-paths` to `link-communities`, on `tiny-uniform` and `small-clustered`. It gives 22 cards. |
| `highway-screen-v1-part-3.json` | [42432019520](https://github.com/mark1russell7/highways/actions/runs/42432019520) | `06cb538` | The last 22 highway strategies with a number option, from `territories` to `corridors+ids`, on `tiny-uniform` and `small-clustered`. It gives 22 cards. |
| `room-screen-v1.json` | [42431741520](https://github.com/mark1russell7/highways/actions/runs/42431741520) | `3c8cd4b` | The room strategies `routes`, `lines` and `levels` in the pipeline of the step `whole`, on `tiny-uniform` and `small-clustered`. It gives 3 cards. |
| `group-screen-v1.json` | [42439519618](https://github.com/mark1russell7/highways/actions/runs/42439519618) | `4fd6941` | The group strategies `quadtree`, `kd` and `cut`, on `tiny-uniform` and `small-clustered`. The strategy `keys` has no number option. It gives 3 cards. |
| `router-screen-v1.json` | [42439529593](https://github.com/mark1russell7/highways/actions/runs/42439529593) | `4fd6941` | The 7 router strategies with a number option, from `corners` to `sections-tree`, on `tiny-uniform` and `small-clustered`. It gives 7 cards. |
| `curve-screen-v1.json` | [42440536324](https://github.com/mark1russell7/highways/actions/runs/42440536324) | `4fd6941` | The 6 curve strategies with a number option, from `rounded` to `highway`, on `tiny-uniform` and `small-clustered`. It gives 6 cards. |
| `plugs-screen-v1.json` | [42441295262](https://github.com/mark1russell7/highways/actions/runs/42441295262) | `143ce64` | The 6 plug strategies with a number option, from `side` to `escape`, on `tiny-uniform` and `small-clustered`. It gives 6 cards. |
| `levels-screen-v1.json` | [42442125207](https://github.com/mark1russell7/highways/actions/runs/42442125207) | `143ce64` | The level strategies `depths`, `venation` and `detail`, on `tiny-uniform` and `small-clustered`. It gives 3 cards. |
| `whole-screen-v1.json` | [42442134947](https://github.com/mark1russell7/highways/actions/runs/42442134947) | `143ce64` | The 7 whole strategies with a number option, from `board-portfolio` to `choice`, on `tiny-uniform` and `small-clustered`. The strategy `pipeline` has no number option. It gives 7 cards. |

- The first copy of this file came from a local machine. The record of the run has the same route measures on each of the 588 points. Only `ms` and `ms.ratio` differ, because they are times.
- To add a record, start `Sweep` and download its artifact `sweep` into a new empty folder. Copy `sweep.json` here with its bytes, and add its row to this table.
- An empty input `families` gives the default families of the workflow, not each family. To sweep each family, give their names.
