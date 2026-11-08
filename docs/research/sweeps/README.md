# The sweep records

A sweep record holds the response curves of the strategy cards. Part 2 of the strategy cards (STRATEGY-CARDS) writes these records from the nightly sweep. The explorer page reads the same records.

## The format

Each file is one JSON record of the format `response-records/1` of `@mark1russell7/rigor-statistics`. `fitResponse` writes the record, and `parseResponseRecord` reads it. This folder adds two rules:

- The record has the categorical dimensions `step` and `strategy`. Each pair of a step and a strategy is one card.
- Each other dimension is an option of the strategy, for example `gap`.

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
- The list `NO_CURVE` of `packages/site/src/kpi.ts` gives the 6 other strategies, each with its reason. A test holds the list against the registry.

## The source of each record

The format `response-records/1` refuses a field that it does not have. Thus a record cannot name its run, and this table names it.

| File | The workflow `Sweep` | Commit | Inputs |
|---|---|---|---|
| `router-screen-v1-sample.json` | [42424232256](https://github.com/mark1russell7/highways/actions/runs/42424232256) | `1db7ef7` | `corners`, `trunks` and `shared` on `tiny-uniform` and `small-clustered` |
| `room-screen-v1.json` | [42431741520](https://github.com/mark1russell7/highways/actions/runs/42431741520) | `3c8cd4b` | The room strategies `routes`, `lines` and `levels` in the pipeline of the step `whole`, on `tiny-uniform` and `small-clustered`. It gives 3 cards. |

- The first copy of this file came from a local machine. The record of the run has the same route measures on each of the 588 points. Only `ms` and `ms.ratio` differ, because they are times.
- To add a record, start `Sweep` and download its artifact `sweep` into a new empty folder. Copy `sweep.json` here with its bytes, and add its row to this table.
- An empty input `families` gives the default families of the workflow, not each family. To sweep each family, give their names.
