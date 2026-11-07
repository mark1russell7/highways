# The sweep records

A sweep record holds the response curves of one strategy card. Each curve changes one option of the strategy, and it keeps the other options at their defaults. Part 2 of the strategy cards (STRATEGY-CARDS) writes these records from the nightly sweep.

## The format

Each file is one JSON record of the format `sweep/1`:

```json
{
  "format": "sweep/1",
  "step": "router",
  "strategy": "corners",
  "date": "2026-11-11",
  "curves": [
    { "option": "gap", "points": [{ "value": 4, "measures": { "route.crossings": 12 } }, { "value": 8, "measures": { "route.crossings": 9 } }] }
  ]
}
```

- `step` and `strategy` name the card.
- `date` is the date of the run of the sweep.
- Each curve has the name of its option and one point for each value of the option. A point has the mean of each measure at that value.

## The count

The file `kpi.json` of the site has the measure `cards-with-curves`. It counts each card with a record that has a curve of 2 points or more. Two records of one card count once. The measure has the date of the latest record.
