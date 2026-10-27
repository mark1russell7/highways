# The promotion rule

This note tells when a kept option becomes a default, and when a selector picks it for each input. The screen of an idea ([CATALOG](research/CATALOG.md)) keeps or drops the idea. A kept idea is an option that is off by default. It changes no view until the promotion rule makes it a default.

The joint selector of `layout-stack` uses the same rule, with the joint measures and the hard rules of the two stages.

## The steps of a promotion

1. **The candidate.** The idea has the verdict `kept` in the catalog. Its option or strategy is in a release.
2. **The prediction.** Write the prediction before the promotion screen. It names the measures, the values that it expects and its confidence. The screen writes the prediction id in each record.
3. **The promotion screen.** Screen the candidate and the current default on the same inputs, in CI. The inputs are the promotion corpus (refer to [The corpus](#the-corpus)).
4. **The win test.** Apply the five tests of [The win test](#the-win-test). All five must pass.
5. **The decision.** The option becomes the default when the test passes on the full corpus. When it passes only on some cells, the option becomes a rule of the selector (refer to [The selector](#the-selector)). Otherwise, the option stays off.
6. **The release.** A change of the default routes is MINOR before 1.0.0. The same PR updates the digest tests and names the screen run. The hosts get a message before the release.

## The corpus

- The promotion corpus is every input of the current screen sets, with all their seeds.
- The bench fixtures up to 1000 nodes give the times.
- The decision uses holdout seeds: seeds that the screen of the idea did not use. The generators of the shared corpus (CORPUS) make them.
- Until CORPUS is in the screen, the holdout is the inputs of `screen-v1` outside the decision boards of the idea.

## The win test

The test compares the candidate with the current default on each input of the corpus. The guard measures are the measures of the step in [The measures of each step](#the-measures-of-each-step). The win measures are the measures that the record of the idea names in `wins`.

| Test | Rule |
|---|---|
| Hard rules | On each input, each hard count of the candidate is at most that of the default. Two runs give the same output. |
| Median | On the median over the inputs, no guard measure is more than 2% worse. |
| Tail | Each guard measure is more than 10% worse on at most 10% of the inputs. |
| Gain | One win measure is 5% or more better on the median. It is better on 60% or more of the inputs. |
| Time | The median time is at most 1.5 times that of the default. The large bench fixtures stay in their CI time limit. |

The values 2%, 10%, 5%, 60% and 1.5 are the first values. A change of a value is a change of this note, with a reason.

## The measures of each step

The ids are the ids of [the measure note](research/MEASURES.md).

| Step | Guard measures |
|---|---|
| `router` | `R1`, `R4`, `R5` q0.95, `R11` min, `B1` |
| `highway` | `R1`, `B1`, `B3` q0.95, `B6` max |
| `curve` | `C3`, `C5`, `C7`, `C8` max |
| `room` | `R1`, `R12` |
| `group` | `Z4`, `Z5`, `Z6`, `Z9` |

## The selector

- The selector is a strategy that picks an option for each input. It reads only the cells of the input, before the routing. The cells are `edgeDensity`, `edgeShape`, `groups`, `ports` and the cells of the packer.
- A rule of the selector is a cell and an option. The win test must pass on the inputs of that cell, with 10 or more inputs in the cell.
- A cell with fewer inputs gets more inputs from the generators before the decision.
- The selector is off by default. Its first rule makes a later item (SELECT).

## The order of promotions

- Promote one option at a time. After each promotion, the screen compares the next candidate with the new default.
- Two kept options of one step can change each other. Screen such a pair as a stack too, before the second promotion.

## Demotion

A later corpus can show that a default fails the win test against the option that it replaced. Then the old default comes back, with the same steps. The change of the default routes is MINOR.

## The record of a promotion

The record of the idea in the catalog gets a field `promotion`. It holds the date, the prediction id and the screen run. It also holds the result of each test and the decision. The roadmap gets a row.
