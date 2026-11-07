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
