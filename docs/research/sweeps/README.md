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

## The source of each record

The format `response-records/1` refuses a field that it does not have. Thus a record cannot name its run, and this table names it.

| File | The workflow `Sweep` | Commit | Inputs |
|---|---|---|---|
| `router-screen-v1-sample.json` | [42424232256](https://github.com/mark1russell7/highways/actions/runs/42424232256) | `1db7ef7` | `corners`, `trunks` and `shared` on `tiny-uniform` and `small-clustered` |
| `highway-screen-v1-part-1.json` | [42429126987](https://github.com/mark1russell7/highways/actions/runs/42429126987) | `4c57061` | The first 22 highway strategies with a number option, from `keys` to `growth`, on `tiny-uniform` and `small-clustered`. It gives 22 cards. |
| `highway-screen-v1-part-2.json` | [42430144949](https://github.com/mark1russell7/highways/actions/runs/42430144949) | `06cb538` | The next 22 highway strategies with a number option, from `edge-paths` to `link-communities`, on `tiny-uniform` and `small-clustered`. It gives 22 cards. |
| `highway-screen-v1-part-3.json` | [42432019520](https://github.com/mark1russell7/highways/actions/runs/42432019520) | `06cb538` | The last 22 highway strategies with a number option, from `territories` to `corridors+ids`, on `tiny-uniform` and `small-clustered`. It gives 22 cards. |

- The first copy of this file came from a local machine. The record of the run has the same route measures on each of the 588 points. Only `ms` and `ms.ratio` differ, because they are times.
- To add a record, start `Sweep` and download its artifact `sweep` into a new empty folder. Copy `sweep.json` here with its bytes, and add its row to this table.
- An empty input `families` gives the default families of the workflow, not each family. To sweep each family, give their names.
