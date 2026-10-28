# The idea catalog

This note joins the ideas of the five research notes into one catalog (IDEA0). BUILD-W builds and screens the ideas in the waves of this note.

## Summary

- The catalog has 273 records in five family files. 24 groups hold the same idea in two or three families, so the catalog has 248 distinct ideas.
- Each record has a stage. 271 records are at the stage `cataloged`. `HWY-031` and its rider are at `prototyped`.
- No idea leaves the catalog without a screen result.
- The three forms of the merge-angle law agree. The router `shared` follows a different model: a greedy Snell merge with a fixed charge.
- The build order has seven waves. Wave 1 holds 11 cheap ideas that need no new step. Wave 2 holds 17 ideas of the step `highway`.
- The ideas need 26 measures of MEAS0 that the screen did not have. MEAS3 adds them. The screen has 13 of them since MEAS3A, and 13 are left.

## The files

| File | What it holds |
|---|---|
| [`ideas/highway.json`](ideas/highway.json) | `HWY-001` to `HWY-060`, from [the highway note](HIGHWAYS.md) |
| [`ideas/wild.json`](ideas/wild.json) | `WILD-001` to `WILD-060`, from [the note of new ideas](IDEAS.md) |
| [`ideas/fields.json`](ideas/fields.json) | `EDA-001` to `EDA-051`, from [the note of other fields](FIELDS.md) |
| [`ideas/nature.json`](ideas/nature.json) | `NAT-001` to `NAT-049`, from [the note of nature](NATURE.md) |
| [`ideas/rules.json`](ideas/rules.json) | `RULE-001` to `RULE-053`, from [the note of rules](RULES.md) |
| [`ideas/schema.json`](ideas/schema.json) | The JSON Schema of a record |
| [`ideas/meas3.json`](ideas/meas3.json) | The measures that the ideas need and that the screen does not have (MEAS3) |
| [`ideas/index.json`](ideas/index.json) | All records sorted by id, and the counts. The script makes this file. |

### The fields of a record

- Each record has the fields of the five notes: `id`, `family`, `name`, `kind`, `sources`, `step`, `mechanism`, `math` and `cost`.
- It also has `params`, `wins`, `risks`, `placementDependent`, `screen`, `prototype`, `stage` and `related`.
- A WILD record also has `method`. A RULE record also has `rules`, `hardRules` and `zoom`.
- `related` holds the near ideas of all families. `same` holds the other members of a duplicate group.
- `canonical` names the member of a group that BUILD-W builds. Only the other members have this field. They take the stage and the wave of the canonical.
- `dependsOn` holds the ideas that BUILD-W must build first. `wave` is the wave of the build order.
- `stage` is one of `cataloged`, `screened`, `prototyped`, `built`, `kept` and `dropped`.
- `result` holds the screen result: the ids of the screen records, the measures that decided and the date. A `dropped` record must have a `result`.
  - `measures` gives each measure that decided as `{ base, new }`. A value is a number, or the numbers by board.
  - `run` links the CI run of the screen. `verdict` is `kept`, `dropped`, `screened` or `not-exercised`. `note` tells the reason.
  - `strict` gives the verdict again with the strict wave rule of WIN-RES: the date, the board count, the new verdict and the old verdict.
  - `activation` gives the verdict again with the activation rule of ACTIVATION. It holds the date, the run, the candidates, the exercised candidates, the new verdict and the old verdict. `oldStage` keeps the stage before the rule.

### How to change the catalog

1. Change the family file.
2. Start `pnpm ideas` from the root. The script checks the records and writes `index.json`.
3. Start the test `packages/core/src/bench/screen/ideas.test.ts`. CI starts it too.

The test checks five things:

- Each record agrees with the schema.
- Each id is unique.
- Each id in `related`, `same` and `dependsOn` exists.
- Each measure id in `wins`, `risks` and `screen` is in the `MEASURES` table of the screen or in MEAS3.
- The index is current.

It also checks the groups: one canonical in each group, and the same stage and wave for each member. An idea in `dependsOn` is not in a later wave.

## The counts

The counts are for 2026-10-27. `index.json` gives the current counts.

The screen of wave 1c split two pairs, because each idea of the pair got a different verdict. `HWY-039` (rip-up passes) is not the same idea as `EDA-029`. `WILD-022` (shortest first) is not the same idea as `NAT-024` (longest first). Thus the catalog has 250 distinct ideas. The tables below keep the first counts.

| Family | Records | Distinct ideas |
|---|---|---|
| `highway` | 60 | 56 |
| `wild` | 60 | 51 |
| `fields` | 51 | 46 |
| `nature` | 49 | 47 |
| `rules` | 53 | 48 |
| All | 273 | 248 |

The other counts are for the 248 distinct ideas.

| Kind | Ideas |
|---|---|
| `literature` | 89 |
| `ours` | 83 |
| `hybrid` | 76 |

| Step | Ideas |
|---|---|
| `highway` | 95 |
| `router` | 62 |
| `whole` | 29 |
| `levels` | 20 |
| `room` | 17 |
| `group` | 9 |
| `curve` | 8 |
| `plugs` | 8 |

| Stage | Records |
|---|---|
| `cataloged` | 271 |
| `prototyped` | 2 |
| `screened`, `built`, `kept` and `dropped` | 0 |

HWY-STEP ([#67](https://github.com/mark1russell7/highways/pull/67)) added the strategy `corridors`, which is the build of `HWY-031`. BUILD-Q1 screened it. Refer to [Queue builds](#queue-builds).

## The duplicate groups

Each note was written without the others. Thus some ideas are in two or three notes. A group holds the records with the same mechanism. The first id is the canonical. The other records keep their text, because each note adds its own details.

| Canonical | Same idea | Wave | Why it is one idea |
|---|---|---|---|
| `EDA-029` | `HWY-038` | 1 | The cost `f^α` on shared links. |
| `WILD-002` | `NAT-031` | 1 | Even spacing of the plugs on a side. |
| `HWY-031` | `WILD-030` | 2 | Highways from the overlap of first routes. |
| `HWY-034` | `EDA-050` | 2 | Road classes from the use of the corner graph. |
| `HWY-015` | `WILD-005` | 2 | Edges that leave a box in the same direction share one stub. |
| `HWY-056` | `WILD-034` | 2 | The links of the far levels become the highways. |
| `EDA-046` | `HWY-037` | 2 | One tree to the target of a fan. |
| `EDA-033` | `WILD-032` | 2 | Highways from the demand between cells. |
| `NAT-022` | `WILD-037` | 2 | Near routes that come together, as a zipper. |
| `HWY-002` | `RULE-002` | 3 | Force bundling with a push from the boxes. |
| `RULE-028` | `HWY-006` | 3 | Density bundling with a mask of the boxes. |
| `HWY-005` | `NAT-005` | 3 | Walkers that make trails: a used cell costs less. |
| `HWY-017` | `EDA-035` | 3 | Spiral trees for a fan. |
| `HWY-036` | `EDA-015` | 3 | A rectilinear Steiner tree for a group. |
| `RULE-021` | `WILD-028` | 4 | Candidate routes and one joint choice. |
| `RULE-049` | `WILD-042` | 4 | A nudge to a right angle at each crossing. |
| `WILD-016` | `EDA-038` | 4 | Lanes that join into one line at far zoom. |
| `EDA-049` | `WILD-029` | 4 | Route each group alone, then join the parts. |
| `EDA-012` | `RULE-025` | 5 | Prices on shared resources, by dual ascent. |
| `RULE-032` | `EDA-001` | 5 | A wavefront on a grid. |
| `NAT-023` | `RULE-005` | 6 | A harmonic field that guides the routes. |
| `NAT-026` | `RULE-001` | 6 | Elastic bands. |
| `NAT-034` | `RULE-030` | 6 | The medial axis of the free space. |

### Near ideas

A near idea shares a part with an idea of another family, but it is not the same. Each near pair is in `related`, in both directions. The catalog has 257 links of `related` between families. These pairs need care:

- **Hysteresis.** `HWY-046`, `RULE-053` and `WILD-014` use one gate with two limits, for three different decisions. Each one gets its own screen.
- **Exact answers.** `RULE-013`, `WILD-055`, `EDA-026`, `EDA-043`, `HWY-040` and `WILD-054` all solve small boards exactly or give a bound. They share a solver, but each one asks a different question.
- **The cost `f^α`.** `EDA-029` sets the cost. `EDA-030`, `NAT-012` and `HWY-043` place the junctions for it. `NAT-035` bends the merges, `HWY-047` gives the break-even length and `NAT-013` adds loops.
- **The order of the routes.** `NAT-024` orders the routes. `WILD-053` makes the result free of the input order. `WILD-056` measures how much the order changes the result.
- **Lanes.** `EDA-004` gives each lane a track in a gap. `WILD-019` asks the room step for the space of these tracks.

## The merge-angle law

### Three forms of one law

Two edges with the flow 1 each join into a trunk with the flow 2. A link with the flow `f` costs `f^α` for each unit of length, with `0 ≤ α ≤ 1`.

| Note | Form | Angle |
|---|---|---|
| [HWY-R](HIGHWAYS.md) | `cos θ = 2^(α-1)` | `θ` is the angle of each branch to the trunk. |
| [EDA-R](FIELDS.md) | `cos θ = 2^(2α-1) - 1` | `θ` is the full angle between the two branches. |
| [NAT-R](NATURE.md) | `cos(θ/2) = 2^(α-1)` | `θ` is the full angle between the two branches. |

Let `φ` be the branch angle of HWY-R. Then `cos 2φ = 2 cos^2 φ - 1 = 2 · 2^(2α-2) - 1 = 2^(2α-1) - 1`. This is the form of EDA-R with `θ = 2φ`. The form of NAT-R is the form of HWY-R with `θ/2 = φ`. Thus the three forms agree.

| `α` | Branch angle | Full angle |
|---|---|---|
| 0 (Steiner tree) | 60° | 120° |
| 0.5 | 45° | 90° |
| 2/3 (Murray) | 37.5° | 74.9° |
| 0.75 | 32.8° | 65.5° |

For two flows `m1` and `m2`, EDA-R gives the general form `cos θ = ((m1 + m2)^(2α) - m1^(2α) - m2^(2α)) / (2 m1^α m2^α)`.

### The Snell merge, a different model

NAT-R also gives a Snell merge. One route joins a highway that is fixed. A unit of length on the highway costs `δ` against 1 off it. The route meets the highway at the angle `θ` to it, with `cos θ = δ`.

- `δ = 0.25` gives 75.5°, `δ = 0.5` gives 60° and `δ = 0.75` gives 41.4°.
- The Y law is a Snell merge with `δ = 2^(α-1)`. Each of the two edges pays this share of the trunk.

### The model of `shared` today

The router `shared` (`packages/core/src/routers/shared.ts`) follows the Snell model with a fixed charge, not the law `f^α`.

- The edges of a key go one by one, the longest first.
- A link that an earlier edge of the key uses costs `discount` times its length. The default `discount` is 0.5.
- Thus a link with `k` users costs `L (1 + (k - 1) δ)`. This is a fixed charge `(1 - δ) L` and a cost `δ L` for each user.
- The first route goes straight. A later route joins it at about `acos(0.5) = 60°`, if the corner graph has a link in that direction.
- For two users, `1 + δ = 2^α` gives `α ≈ 0.585`. For more users, the cost grows linearly, and the merges are not symmetric.

`EDA-029` (wave 1) puts the law `f^α` into `shared`, with `α` as a parameter. `NAT-035` (wave 1) bends each merge to the Snell angle. The measure `B6` (merge angle) decides both. Thus `B6` must be in the screen before wave 1.

## The build order

BUILD-W works through the waves in order. In a wave, the table gives the order. A rider (a member of a group that is not the canonical) goes with its canonical. Each idea gets a screen. A `dropped` record gets a `result`, so no idea leaves without a screen result.

The columns of the tables:

- **Wins** gives the measure ids that the idea makes better.
- **Size** gives the size of the prototype: S (small), M (medium) or L (large).
- The field `screen` of each record gives the full rule that keeps or drops the idea.

| Wave | Ideas | Records | Expected wins | Cost (S, M, L) | What it needs |
|---|---|---|---|---|---|
| 1 | 11 | 15 | `R5`, `B1`, `B2`, `R1`, `R4`, `R10` | 10, 1, 0 | `B2`, `B3` and `B6` in the screen |
| 2 | 17 | 24 | `B1`, `B2`, `B8`, `B3`, `Z10`, `B6` | 15, 2, 0 | The step `highway` (HWY-STEP, shipped) |
| 3 | 43 | 48 | `B1`, `B8`, `B2`, `B4`, `B7`, `R1` | 13, 27, 3 | The corridors and merge points of wave 2 |
| 4 | 50 | 54 | `B1`, `R1`, `R5`, `M1`, `Z10`, `M4` | 18, 30, 2 | The measures W1 to W7 |
| 5 | 41 | 43 | `R12`, `M4`, `R5`, `R6`, `R1`, `B5` | 15, 21, 5 | `R12`, `B5` and `M4` in the screen |
| 6 | 43 | 46 | `B1`, `R5`, `B2`, `B7`, `R4`, `B6` | 14, 26, 3 | A measure of loops (P2) |
| 7 | 43 | 43 | `R8`, `R12`, `R1`, `R3`, `R14`, `R2` | 14, 19, 10 | The repair step `RULE-046` of wave 1 |

### Wave 1: cheap ideas that need no new step

Each idea of wave 1 changes a step or a router that exists. It changes the plugs, the room, the routers `shared` and `trunks`, or the edge order. Each note ranks these ideas high.

- **Expected wins.** `R5`, `B1`, `B2`, `R1`, `R4` and `R10`.
- **The screen that decides.** The screen boards `small-clustered`, `case-dense-groups`, `case-many-groups` and `mid-fanout`, with 5 seeds. `EDA-029` and `NAT-017` keep a setting when it is better than `discount` 0.5 on `B1` and the `B3` q95. `NAT-035` and `EDA-030` keep when the `B6` max falls.
- **Cost.** 10 small prototypes and 1 medium prototype.

### Wave 2: the step `highway`

The ideas of wave 2 are strategies of the step `highway`. HWY-STEP made this step and the step `follow`. The corridor signatures (`HWY-031`) and the merge points (`HWY-050`) come first.

- **Expected wins.** `B1`, `B2`, `B8`, `B3`, `Z10` and `B6`.
- **The screen that decides.** Five boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). The baselines are `corners`, `shared` and `trunks`. An idea stays when it is better than `shared` on 3 of 5 boards.
  - A board is a win only when neither `B1` nor the `B3` q95 is `"worse"`, and one or both is `"better"`. `compareMeasure` gives these classes, and a change at most the minimum effect is a `"tie"`. A tie is not a win (WIN-RES, [the per-input classification](../PROMOTION.md#the-per-input-classification)).
- **Cost.** 15 small prototypes and 2 medium prototypes.

### Wave 3: the other highway ideas

Wave 3 holds the other ideas of the highway note. The ideas of tier 2 come first, then tier 3.

- **Expected wins.** `B1`, `B8`, `B2`, `B4`, `B7` and `R1`.
- **The screen that decides.** The five boards of wave 2, with the same baselines.
- **Cost.** 13 small, 27 medium and 3 large prototypes.

### The activation rule

A strategy that does not do its own move on any board was not tested. Its verdict tells nothing about the idea (ACTIVATION).

- A verdict counts only when a candidate of the idea is exercised on one decision board or more.
- A candidate is exercised when its own move count is above 0, or when its `outputHash` differs from the hash of its base.
- The decision boards are `small-clustered`, `dense-groups`, `hub-chain` and `many-groups` of `screen-v1`.
- Otherwise the verdict is `not-exercised`, with the reason when it is known. The idea goes back to the stage `prototyped` for a new build. It does not go to `dropped`.
- An output group holds the candidates with the same hash on each decision input. The group counts one time in the counts of a wave, and its verdict applies to each member.
- The field `result.activation` keeps the old verdict and the old stage.
- [The activation report](../LAYOUT-RECORDS.md#the-activation-report) tells how the screen gives the counts and the groups.

#### The silent strategies of waves 1 to 3

The screen of 2026-10-28 ([run 40628435755](https://github.com/mark1russell7/highways/actions/runs/40628435755)) examined 289 strategies on 8 decision inputs. 17 strategies are silent. 15 of them go to a rebuild wave. The reasons come from the move counts and the code. A diagnostic run has not yet confirmed each reason.

| Strategies | Reason |
|---|---|
| `hw:power`, `w3e:power-near`, `w3e:power-saved1` | The finder makes 0 power edges on each decision input. Equal neighbour sets are rare, and the near match with Jaccard 0.8 is too strict. The scope `collection` fires. |
| `w3e:power+stretch` | The gate has no edge to cut, because its base `hw:power` is silent. |
| `hw:corridors+breakeven`, `hw:corridors+stretch`, `w2a:corridors+breakeven-a0`, `w2a:corridors+stretch-1.1`, `w2a:corridors+stretch-1.5`, `w2a:corridors+stretch+breakeven` | A corridor holds edges of one signature. Their routes stay in the stretch budget and break even, so the gate removes no edge. The same gates fire on `shared-ways`. |
| `hw:corridors+ids`, `w2a:shared-ways+ids` | The gate `ids` acts only between two edits, and the static screen has no edits. The edit screen of `HWY-054` shows the move on 4 of 4 boards, so its verdict stays. |
| `w3b:lanes-corridors` | The lanes change nothing on the plan of `corridors`. |
| `w2c:flow-field+stretch`, `w3f:consensus+stretch`, `w3f:link-communities+stretch`, `w3f:scale-space+stretch` | No edge of these finders is longer than 1.2 times its route alone, so the gate cuts no edge. |

The screen also found 16 output groups. Each group holds strategies with the same output on each decision input. For example, `hw:cubu` and `w3d:cubu-fft` are one group, and `hw:lanes`, `w3b:lanes-shared-ways` and `w3b:lanes-w16` are one group.

### Wave 4: the other new ideas (WILD)

Wave 4 holds the other ideas of the note of new ideas, in the build order of that note. It also holds `RULE-021`, `RULE-049` and `EDA-049`, because their riders are WILD ideas.

- **Expected wins.** `B1`, `R1`, `R5`, `M1`, `Z10` and `M4`.
- **The screen that decides.** The field `screen` of each record. The new measures `WILD-054` to `WILD-060` come first, because other screens use them.
- **Cost.** 18 small, 30 medium and 2 large prototypes.

### Wave 5: the other ideas from other fields (EDA)

Wave 5 holds the other ideas of the note of other fields, in the build order of that note. `EDA-019` comes before `EDA-008`, because `EDA-008` needs it. Wave 5 also holds `RULE-032`.

- **Expected wins.** `R12`, `M4`, `R5`, `R6`, `R1` and `B5`.
- **The screen that decides.** The table of screens in the note of other fields.
- **Cost.** 15 small, 21 medium and 5 large prototypes.

### Wave 6: the other ideas from nature (NAT)

Wave 6 holds the other ideas of the note of nature, in the build order of that note.

- **Expected wins.** `B1`, `R5`, `B2`, `B7`, `R4` and `B6`.
- **The screen that decides.** The field `screen` of each record. The note expects to drop `NAT-002`, `NAT-028`, `NAT-041` and `NAT-047`. They get a screen all the same.
- **Cost.** 14 small, 26 medium and 3 large prototypes.

### Wave 7: the other rule ideas (RULE)

Wave 7 holds the other ideas of the note of rules, in the build order of that note, then in the order of its ranking.

- **Expected wins.** `R8`, `R12`, `R1`, `R3`, `R14` and `R2`.
- **The screen that decides.** The field `screen` of each record. Each soft method uses the repair step `RULE-046` for the hard rules. Thus a screen counts 0 hard faults.
- **Cost.** 14 small, 19 medium and 10 large prototypes.

### The ideas of each wave

#### Wave 1 ideas

| Order | Id | Name | Step | Wins | Size |
|---|---|---|---|---|---|
| 1 | WILD-053 | Input in any order | `whole` | Z10, G9 | S |
| 2 | WILD-056 | Order fragility and the price of anarchy | `whole` | R1, R5, B1 | S |
| 3 | NAT-024 | Pioneer and follower order | `router` | B1, B2, R5 | S |
| 4 | WILD-001 | Free plugs on a side | `plugs` | R3, R4, R10 | M |
| 5 | WILD-002 (with NAT-031) | Plug justification | `plugs` | R11, R1, R10 | S |
| 6 | EDA-004 | Constrained left-edge tracks in each gap | `room` | M1, M4, R12 | S |
| 7 | RULE-046 | One repair step for the hard rules after any method | `router` | R9, Z2, Z3 | S |
| 8 | EDA-029 (with HWY-038) | Branched transport cost (Gilbert flow cost) | `highway` | B1, B2, B7 | S |
| 9 | EDA-030 | Gilbert split point for trunks | `highway` | B1, B6, R5 | S |
| 10 | NAT-035 | Snell merges | `highway` | B6, R4, C3, R5 | S |
| 11 | NAT-017 | Balancing-factor trees | `highway` | B1, B2, B3, R5 | S |

#### Wave 2 ideas

| Order | Id | Name | Step | Wins | Size |
|---|---|---|---|---|---|
| 1 | HWY-031 (with WILD-030) | Corridor signatures: overlap of the first routes | `highway` | B1, B2, B3, B8 | S |
| 2 | HWY-050 | Merge and split points where the routes meet and part | `highway` | B3, B6, R4 | S |
| 3 | HWY-047 | Break-even overlap law | `highway` | B1, B6, B3 | S |
| 4 | HWY-046 | Count threshold with hysteresis | `highway` | Z10, B8 | S |
| 5 | HWY-048 | Stretch budget for each edge (join test) | `highway` | B3, R5, R6, R7 | S |
| 6 | HWY-049 | Ambiguity guard | `highway` | B4 | S |
| 7 | HWY-026 | QuickBundles: one pass with a distance threshold | `highway` | B1, B2, Z10 | S |
| 8 | HWY-034 (with EDA-050) | Route betweenness on the corner graph (road classes) | `highway` | B1, B2, B8, Z10 | S |
| 9 | HWY-043 | Meeting points by Weiszfeld with a weighted trunk | `highway` | B1, B6 | S |
| 10 | HWY-054 | Stable highway ids across edits | `highway` | Z10 | S |
| 11 | HWY-015 (with WILD-005) | Stub bundling at both ends | `highway` | R11, B2, B4 | S |
| 12 | EDA-046 (with HWY-037) | Flow field for each target | `highway` | B1, B2, R1 | S |
| 13 | HWY-056 (with WILD-034) | Level links become highways | `highway` | Z9, B1, B8 | S |
| 14 | HWY-018 | Clustered edge routing with the WSPD | `highway` | B1, B2, B8, Z10 | M |
| 15 | HWY-045 | Candidate generation and selection | `highway` | B1, B3, B4 | M |
| 16 | NAT-022 (with WILD-037) | Axon zipper | `highway` | B1, B2, B7, R12 | S |
| 17 | EDA-033 (with WILD-032) | Consolidation by origin and destination cells | `highway` | B1, B2, B8, Z9 | S |

#### Wave 3 ideas

| Order | Id | Name | Step | Wins | Size |
|---|---|---|---|---|---|
| 1 | HWY-003 | Multilevel agglomerative edge bundling (MINGLE) | `highway` | B1, B2, B8, R1 | M |
| 2 | HWY-017 (with EDA-035) | Flow maps with spiral trees for a fan-out | `highway` | B1, B6, R4, B2 | M |
| 3 | HWY-052 | Highways for each zoom level that nest | `levels` | Z7, Z8, Z9, Z4 | M |
| 4 | HWY-040 | Fixed-charge network design, exact on small boards | `highway` | B1 | L |
| 5 | HWY-023 | End point clustering in 4D (flow clustering) | `highway` | B1, B2, B4 | S |
| 6 | HWY-025 | Segment clustering of the first routes (TRACLUS) | `highway` | B1, B2, B8, B9 | M |
| 7 | HWY-020 | Route-aware bundling on the corner graph | `highway` | B1, B2, R9 | S |
| 8 | HWY-005 (with NAT-005) | Winding Roads: grid routing with a reuse discount | `router` | B1, B2, B8 | S |
| 9 | HWY-016 | Ordered bundles with channel capacity (metro-line style) | `router` | M4, B5, R8 | S |
| 10 | HWY-051 | Width, lanes and capacity: split a highway that does not fit | `highway` | M4, R8, B9 | S |
| 11 | HWY-055 | Local growth by accretion and extension | `highway` | B1, B2, Z10 | S |
| 12 | HWY-012 | Edge-path bundling: ride along the routes of a graph path | `highway` | B4, B1 | M |
| 13 | HWY-019 | Attribute-driven bundling: soft keys | `highway` | B1, B2 | S |
| 14 | HWY-011 | Divided edge bundling: two-way highways with sides | `highway` | B5, B9, R1 | S |
| 15 | HWY-024 | Hough voting for corridors | `highway` | B1, R14, B2 | S |
| 16 | HWY-032 | Ridges of the line density in one pass | `highway` | B1, B7 | S |
| 17 | HWY-028 | HDBSCAN on edges with a compatibility distance | `highway` | B1, B4, B8 | M |
| 18 | HWY-042 | Hub arc location: choose q highways | `highway` | B1, B8, B3 | M |
| 19 | HWY-001 | Hierarchical edge bundling along the tree of sections | `highway` | B1, B2, B8, G8, Z9 | S |
| 20 | HWY-002 (with RULE-002) | Force-directed edge bundling (FDEB) with box repulsion | `highway` | B1, B7, B2 | M |
| 21 | HWY-004 | Geometry-based edge clustering with a control mesh | `highway` | B1, B7, R1 | M |
| 22 | RULE-028 (with HWY-006) | Density bundling with a mask of the free space | `highway` | B1, B2, B7 | S |
| 23 | HWY-007 | Fast density bundling: CUBu and FFTEB | `highway` | B1, B7 | S |
| 24 | HWY-008 | Moving least squares bundling (MLSEB) | `highway` | B1, B7, C3 | M |
| 25 | HWY-009 | Skeleton-based edge bundling (SBEB): the skeleton is the spine | `highway` | B1, B9, C3, B6 | M |
| 26 | HWY-010 | Image-based edge bundles: a highway as a shaded area | `highway` | B7, Z4 | M |
| 27 | HWY-013 | Confluent drawings: junctions as train tracks | `highway` | B1, B4, R1, B8 | M |
| 28 | HWY-014 | Edge compression: modules and power graphs | `highway` | B4, B1, R1 | M |
| 29 | HWY-021 | Spectral bundling by effective resistance | `highway` | B4, B1 | M |
| 30 | HWY-022 | Bundled crossings | `highway` | R1, R2, B5 | M |
| 31 | HWY-027 | Subtrajectory clustering by Fréchet distance | `highway` | B9, B1, B8 | L |
| 32 | HWY-029 | Spectral clustering of the compatibility graph | `highway` | B1, B8 | M |
| 33 | HWY-030 | Link communities on the line graph | `highway` | B4, G1 | M |
| 34 | HWY-033 | Territory aggregation of flows | `highway` | B1, B8, Z9 | M |
| 35 | HWY-035 | Consensus of clusterings | `highway` | Z10, B4 | M |
| 36 | HWY-036 (with EDA-015) | Obstacle-avoiding rectilinear Steiner tree for a group | `highway` | B1, R14, B2 | M |
| 37 | HWY-041 | Hub location (p-hub median) | `highway` | B1, B8, Z9 | M |
| 38 | HWY-044 | Negotiated attraction (PathFinder turned around) | `router` | B1, B8, M4 | M |
| 39 | HWY-053 | Scale space with persistence | `levels` | Z10, Z9, B8 | M |
| 40 | HWY-057 | Gap highways | `highway` | R14, M4, B1 | M |
| 41 | HWY-058 | Orthogonal streets by set cover | `highway` | R14, B1, R3 | M |
| 42 | HWY-059 | Local search over the highway set on the measures | `highway` | B1, B3, B4, B6 | M |
| 43 | HWY-060 | Interchanges: a network of highways | `highway` | B1, B8, Z9 | L |

#### Wave 4 ideas

| Order | Id | Name | Step | Wins | Size |
|---|---|---|---|---|---|
| 1 | WILD-039 | One global lane order | `highway` | B5, R1 | S |
| 2 | WILD-038 | Braid crossings at the best place | `highway` | B5, R2, B6 | M |
| 3 | WILD-023 | Tight edges first | `router` | R5, R6, R1 | S |
| 4 | WILD-019 | Squeeze lanes before opening | `room` | M1, M3 | S |
| 5 | WILD-017 | Water-filling room | `room` | M1, M4 | S |
| 6 | WILD-024 | Best-response routing game | `router` | R1, R2, R3 | M |
| 7 | WILD-054 | An ink floor from moats | `whole` | B1 | M |
| 8 | WILD-055 | Exact answers on small boards | `whole` | R1, R5 | L |
| 9 | WILD-045 | A portfolio for each board | `whole` | R1, R5, B1, C3 | M |
| 10 | WILD-050 | Incremental routing after a move | `whole` | Z10 | M |
| 11 | WILD-011 | Level ladder by line breaking | `levels` | Z5, Z4 | S |
| 12 | WILD-014 | Zoom hysteresis | `levels` | Z7, Z10 | S |
| 13 | WILD-004 | Side spill by capacity | `plugs` | R11, R12 | S |
| 14 | WILD-036 | Manifolds for a fan to a row | `highway` | B1, R3, R14, B7 | S |
| 15 | WILD-041 | Lane changes as voice leading | `curve` | B9, C2, C4 | S |
| 16 | WILD-057 | Tracing load | `whole` | R1, B4 | S |
| 17 | WILD-060 | Lane legibility at each zoom | `whole` | B9 | S |
| 18 | WILD-016 (with EDA-038) | Bundle level of detail | `levels` | B7, B1 | S |
| 19 | WILD-012 | Coarse links from fine routes | `levels` | Z9, Z10 | M |
| 20 | WILD-043 | Optical lane spacing at bends | `curve` | R12, B9 | S |
| 21 | WILD-044 | Curve for each edge by a small portfolio | `curve` | C3, C2, C7 | S |
| 22 | WILD-058 | Ink hot spots | `whole` | B7 | S |
| 23 | WILD-059 | Monotone share | `whole` | R7 | S |
| 24 | WILD-003 | Plug auction | `plugs` | R10, R11, R1, R3 | M |
| 25 | WILD-007 | Groups from routes | `group` | G2, Z9, B2 | M |
| 26 | WILD-008 | Line breaking on a space-filling curve | `group` | G2, G6, Z5, Z6 | M |
| 27 | WILD-010 | Incumbent bonus for stable groups | `group` | G9, Z7, Z8, Z10 | M |
| 28 | WILD-013 | Budgeted frontier expansion | `levels` | Z4, Z5, Z6 | M |
| 29 | WILD-025 | Angle-priced crossings | `router` | R2, R1 | M |
| 30 | WILD-026 | Queueing price of a gap | `router` | M4, R12, M1 | M |
| 31 | WILD-027 | Far view first, then refine | `router` | Z9, Z10 | M |
| 32 | WILD-031 | Approval corridors | `highway` | B1, B2, B3 | M |
| 33 | WILD-033 | Savings merge with a fair share | `highway` | B1, B3, R6 | M |
| 34 | WILD-035 | Streets along the cuts | `highway` | B1, B2, B7, R14 | M |
| 35 | WILD-040 | Flush lanes after an exit | `highway` | B9, C2, C3, B6 | M |
| 36 | WILD-046 | Learned choice of the strategy | `whole` | R1, R5, B1 | M |
| 37 | WILD-047 | Automatic tuning with successive halving | `whole` | R5, B1, M1 | M |
| 38 | WILD-049 | Room and routes to a fixed point | `whole` | M4, R9, R5 | M |
| 39 | WILD-006 | Eight-direction plugs | `plugs` | R10, R3, R4 | M |
| 40 | WILD-009 | A vote of the grouping rules | `group` | G9, G2, G4 | M |
| 41 | WILD-015 | Geomorph between levels | `levels` | Z9, Z7 | M |
| 42 | WILD-020 | Seam insertion | `room` | M1, M4 | M |
| 43 | WILD-021 | Gusset room | `room` | M1, M3 | M |
| 44 | WILD-048 | Tune on crops of the board | `whole` | R5, B1 | M |
| 45 | WILD-051 | Advice to the layout | `whole` | R5, R6, R3 | M |
| 46 | WILD-052 | An anytime pipeline | `whole` | Z10 | M |
| 47 | WILD-018 | Room and routes as a market | `room` | M1, M4, R5 | L |
| 48 | RULE-021 (with WILD-028) | Simulated annealing over candidate routes | `router` | R1, R12, B1, R5 | S |
| 49 | RULE-049 (with WILD-042) | Torque to a right angle at each crossing | `router` | R2 | S |
| 50 | EDA-049 (with WILD-029) | Hierarchical pathfinding on the tree of sections | `levels` | Z9, R7 | M |

#### Wave 5 ideas

| Order | Id | Name | Step | Wins | Size |
|---|---|---|---|---|---|
| 1 | EDA-043 | Exact tangent visibility graph | `router` | R5, R6 | S |
| 2 | EDA-022 | Ordered escape for plugs | `plugs` | R1, R11, B5, R10 | S |
| 3 | EDA-028 | Weber hubs | `router` | R5, R6, R7, Z9 | S |
| 4 | EDA-018 | RUDY demand map for room | `room` | M1, M4 | S |
| 5 | EDA-009 | Negotiated congestion (PathFinder) | `router` | M4, R12, B9, R9 | M |
| 6 | EDA-026 | Exact lane order by ILP (metro-line crossing minimization) | `highway` | B5, R1 | M |
| 7 | EDA-013 | Track assignment across gaps | `room` | B5, R1, R15 | M |
| 8 | EDA-032 | Concave then convex link cost | `highway` | B1, M4, R12 | M |
| 9 | EDA-021 | Fat-path bundle routing | `highway` | M4, R12, B9, R9 | M |
| 10 | EDA-010 | Rip-up and reroute | `router` | R7, R6, R1, B5 | S |
| 11 | EDA-051 | Room by congestion prices | `room` | M1, M4, R5 | M |
| 12 | EDA-040 | Active ranges for the levels | `levels` | Z7, Z8, Z4 | M |
| 13 | EDA-002 | Line probe router (Hightower, Mikami-Tabuchi) | `router` | R3, R14, R9 | S |
| 14 | EDA-003 | Hanan grid and orthogonal visibility graph router | `router` | R14, R3, R9, R12 | M |
| 15 | EDA-005 | Dogleg channel routing | `room` | M1, M4 | M |
| 16 | EDA-006 | Greedy channel router | `room` | M1, M4 | M |
| 17 | EDA-007 | Switchbox routing at gap junctions | `room` | B5, R1 | M |
| 18 | EDA-019 | Corner-stitched free tiles as the channel graph | `router` | R8, M4, R12 | M |
| 19 | EDA-008 | Global routing on the gap graph, then tracks, then points | `whole` | M4, R12, R9, M1 | L |
| 20 | EDA-011 | Multicommodity flow with randomized rounding | `router` | M4, R12 | L |
| 21 | EDA-012 (with RULE-025) | Lagrangian prices with a lower bound | `router` | M4, R12 | M |
| 22 | EDA-014 | Layer assignment as zoom levels | `levels` | Z4, Z9, Z5 | M |
| 23 | EDA-016 | River routing for merges and buses | `curve` | B5, R12, B9, B6 | M |
| 24 | EDA-017 | Stretch balance in a bundle (inverse length matching) | `highway` | B3, R6, R5 | S |
| 25 | EDA-020 | Topological routing, then rubber bands | `router` | R5, R6, R8, R12 | L |
| 26 | EDA-023 | Push and shove for edits | `router` | Z10, R12 | M |
| 27 | EDA-024 | Tangent arcs at any angle (TopoR style) | `curve` | C1, C5, R8, B9 | S |
| 28 | EDA-025 | Octilinear grid router | `router` | R3, R4, B1, R2 | M |
| 29 | EDA-027 | Route schematization (C-oriented paths) | `curve` | R3, R14, R4 | S |
| 30 | EDA-031 | Wardrop spreading by Frank-Wolfe | `router` | M4, R12, B9 | M |
| 31 | EDA-034 | Growth order for stable networks | `router` | Z10 | S |
| 32 | EDA-036 | Stroke selection across zoom | `levels` | Z4, Z5, Z9 | M |
| 33 | EDA-037 | Topology-safe simplification for each zoom | `levels` | R3, C3 | S |
| 34 | EDA-039 | Least-squares displacement for room | `room` | M3, M1, M5 | M |
| 35 | EDA-041 | Boundary leaders as plug stubs | `plugs` | R1, R11, R10 | S |
| 36 | EDA-042 | Count badges on bundles | `room` |  | S |
| 37 | EDA-044 | Any-angle search (Theta*, Anya, Polyanya) | `router` | R5, R6 | M |
| 38 | EDA-045 | Navigation mesh with clearance | `router` | R8, M4, R12 | L |
| 39 | EDA-047 | Conflict search over crossings | `router` | R12, R2, R9 | L |
| 40 | EDA-048 | Cooperative A* with lane reservations | `router` | M4, R12 | S |
| 41 | RULE-032 (with EDA-001) | Wavefront automaton with rule costs (Lee) | `router` | R3, R8, R14, B2 | S |

#### Wave 6 ideas

| Order | Id | Name | Step | Wins | Size |
|---|---|---|---|---|---|
| 1 | NAT-020 | Mycelial spanner backbone | `highway` | R5, R6, R7, Z3 | S |
| 2 | NAT-012 | Branched transport junctions | `highway` | B1, B6, B2, R4 | M |
| 3 | NAT-013 | Murray widths and angles | `levels` | B7, B6, M1 | S |
| 4 | NAT-001 | Physarum highways | `highway` | B1, B2, B7, R1 | M |
| 5 | NAT-026 (with RULE-001) | Elastic band curves | `curve` | C3, C4, R8, R4 | S |
| 6 | NAT-032 | Phyllotaxis plug slots | `plugs` | Z10, R11 | S |
| 7 | NAT-042 | Remodelling room | `room` | M4, M1, R5 | S |
| 8 | NAT-039 | Cell-sorting groups | `group` | G1, G2, G4, G7 | M |
| 9 | NAT-037 | Current corridors | `highway` | B1, B2, B4, R5 | M |
| 10 | NAT-009 | Two-way lanes | `highway` | B5, R1 | S |
| 11 | NAT-018 | Knee of the plant Pareto front | `highway` | B1, B3, R5 | S |
| 12 | NAT-003 | Loops from changing loads | `highway` | R6, R5, B3 | M |
| 13 | NAT-049 | Multiscale Physarum across levels | `levels` | Z9, Z10, Z7 | M |
| 14 | NAT-002 | Physarum agents on a field | `highway` | B1, B7, C3 | L |
| 15 | NAT-004 | Canalization feeder trees to hubs | `router` | B1, R1, B2 | M |
| 16 | NAT-006 | Desire-line room | `room` | R5, R6, R7, M4 | S |
| 17 | NAT-007 | Ant colony router | `router` | B1, B2 | M |
| 18 | NAT-008 | Expected ants | `router` | B1, B2, Z10 | M |
| 19 | NAT-010 | Termite hubs | `group` | R5, G8, B1 | M |
| 20 | NAT-011 | Optimal channel networks | `highway` | B1, B2, B6 | M |
| 21 | NAT-014 | Vascular tree by constrained construction | `highway` | B1, B6, B2 | M |
| 22 | NAT-015 | Space colonization trunks | `highway` | B1, B6, C3 | M |
| 23 | NAT-016 | Closed venation backbone for levels | `levels` | B1, R1, Z3, B7 | S |
| 24 | NAT-019 | Bronchial space-filling splits | `highway` | B1, B6, B8, R4 | S |
| 25 | NAT-021 | Tropism growth router | `router` | C3, C5, R4, R15, R10 | M |
| 26 | NAT-023 (with RULE-005) | Harmonic field router | `router` | C3, R4, R8, B1 | M |
| 27 | NAT-025 | Soap-film Steiner trees | `highway` | B1, B7 | M |
| 28 | NAT-027 | Crystal metric | `router` | R14, R3, R4 | M |
| 29 | NAT-028 | Lightning growth | `highway` | B1 | L |
| 30 | NAT-029 | Crack partition | `group` | G2, G8, G4, Z6 | M |
| 31 | NAT-030 | Erosion of a cost field | `highway` | B1, B7, B2 | M |
| 32 | NAT-033 | Foam groups | `group` | G6, G4, G7 | M |
| 33 | NAT-034 (with RULE-030) | Grassfire corridors | `highway` | R8, R12, B1, C7 | M |
| 34 | NAT-036 | Magnetic flow direction | `router` | R7, R4 | S |
| 35 | NAT-038 | Boids lanes | `highway` | B7, R12, B9 | M |
| 36 | NAT-040 | Reaction-diffusion hub spacing | `group` | Z5, G6, R5 | M |
| 37 | NAT-041 | Meinhardt nets | `highway` | B1, B7 | L |
| 38 | NAT-043 | Annealing of the discrete choices | `whole` | R1, B5, R11 | M |
| 39 | NAT-044 | Evolution of the options (NSGA-II) | `whole` | B1, B3, R5, M1 | M |
| 40 | NAT-045 | MAP-Elites atlas of settings | `whole` | B1, R5, C3 | M |
| 41 | NAT-046 | Particle swarm and CMA-ES tuning | `whole` | B1, R5 | S |
| 42 | NAT-047 | Firefly and bee searches | `whole` | B1, R5 | S |
| 43 | NAT-048 | Use-it-or-lose-it pruning | `highway` | B8, B4, R5 | S |

#### Wave 7 ideas

| Order | Id | Name | Step | Wins | Size |
|---|---|---|---|---|---|
| 1 | RULE-044 | Corner graph with rule prices, then rip-up and reroute | `router` | R1, R3, R12, B2 | S |
| 2 | RULE-022 | Position-based dynamics: one rule at a time (XPBD) | `router` | R8, R12, C5, R14 | S |
| 3 | RULE-009 | Separation constraints: the QP that nudges parallel segments | `router` | R12, R8, B9, R11 | S |
| 4 | RULE-050 | Topology first, then one convex program for the geometry | `router` | R12, R8, Z10, R5 | M |
| 5 | RULE-045 | Continuation anchor between the zoom levels | `levels` | Z10, Z9, Z7 | S |
| 6 | RULE-019 | Energy as a sum of rule terms, by gradient descent | `router` | R1, R2, R8, C3 | M |
| 7 | RULE-020 | Adam with a seeded sample of pairs | `router` | R1, R2, R8 | S |
| 8 | RULE-036 | A rule language that compiles to energy and constraints | `whole` | R1, R8, R12 | L |
| 9 | RULE-013 | Integer program for orthogonal routing: the exact reference | `router` | R1, R3, R4, R6 | L |
| 10 | RULE-027 | Differentiable raster loss | `whole` | R12, B7, R8, R9 | M |
| 11 | RULE-033 | Sandpile automaton for the capacity of gaps | `room` | R12, M4, R8 | S |
| 12 | RULE-006 | Distance field and fast marching: the geodesic router | `router` | R8, C7, R4, C3 | M |
| 13 | RULE-053 | A hysteresis gate for discrete choices | `levels` | Z10, Z8, Z9 | S |
| 14 | RULE-003 | Route-to-route repulsion with a cutoff | `router` | R12, R2, R8 | S |
| 15 | RULE-034 | Shape grammar: rewrite rules on parts of routes | `router` | R3, R7, R15, B2 | S |
| 16 | RULE-047 | Pull toward the lane slots of the highway skeleton | `highway` | B2, B1, B9 | S |
| 17 | RULE-052 | Rules that align and snap the legs | `router` | R14 | S |
| 18 | RULE-004 | Magnetic springs: a field that turns segments to a direction | `router` | R14, R10, C10 | S |
| 19 | RULE-007 | Elastic rod: curvature forces on the curve | `curve` | C3, C4, C5, C2 | S |
| 20 | RULE-048 | A curriculum that adds the rules one at a time | `whole` | R1, R2, R12 | S |
| 21 | RULE-011 | Moves that keep the topology (PrEd, ImPrEd) | `router` | R9, R1, Z8, R8 | M |
| 22 | RULE-012 | Cassowary: rules with strengths | `router` | R14, R12, R11, Z10 | M |
| 23 | RULE-017 | Layers of rules in priority order | `whole` | R1, R6 | M |
| 24 | RULE-023 | Barrier and continuous collision checks (IPC) | `router` | R9, R8, C7 | M |
| 25 | RULE-024 | Multigrid over the zoom levels | `levels` | Z9, Z10, Z7 | M |
| 26 | RULE-008 | Stress majorization of the bend points | `router` | R4, R8, R6, R5 | M |
| 27 | RULE-010 | Kamada-Kawai on the skeleton of the hubs | `highway` | B6, B3, R5, Z7 | M |
| 28 | RULE-026 | Motion planners: CHOMP and TrajOpt | `router` | C3, C4, R8 | M |
| 29 | RULE-029 | Clutter measure as a loss | `whole` | R2, R12, R5 | M |
| 30 | RULE-031 | One render loss summed over the zoom levels | `levels` | Z10, Z9, R12 | M |
| 31 | RULE-035 | L-system trees for a fan-out | `highway` | B6, H3, R11 | M |
| 32 | RULE-038 | Rule weights from preferences | `whole` | R1, R2, B1 | M |
| 33 | RULE-043 | Imitation of the exact solver | `router` | R1, R3, R6 | M |
| 34 | RULE-051 | Streamlines of a summed current | `highway` | B1, B2, R8 | M |
| 35 | RULE-014 | Minimum cost flow for the fewest bends | `router` | R3, R14 | L |
| 36 | RULE-015 | SAT and CP-SAT on a grid of cells | `router` | R9, R12, R1 | L |
| 37 | RULE-016 | Octilinear highways by a mixed integer program | `highway` | R14, B6, R3, M2 | L |
| 38 | RULE-037 | Answer set programs for the discrete choices | `highway` | B2, B4, B3 | L |
| 39 | RULE-018 | Wave function collapse with tiles of routes | `router` | R14, R3 | M |
| 40 | RULE-039 | A frozen critic network as a loss | `whole` | R2, R12 | L |
| 41 | RULE-040 | A graph network that gives a warm start | `router` | R1, R8 | L |
| 42 | RULE-041 | A neural time field (NTFields) | `router` | R8, C7 | L |
| 43 | RULE-042 | Reinforcement learning distilled into a fixed scorer | `router` | R1, B1 | L |

## The measures that the screen does not have (MEAS3)

The `MEASURES` table of the screen (`packages/core/src/bench/screen/measures.ts`) has 47 ids of MEAS0. The ideas use 13 more ids of [MEAS0](MEASURES.md). [`ideas/meas3.json`](ideas/meas3.json) lists them. When the screen adds an id, the id leaves `meas3.json`, and the test makes sure of it.

| Id | Measure | Ideas | First wave |
|---|---|---|---|
| `G5` | Overlaps | 7 | 3 |
| `M3` | Displacement | 8 | 4 |
| `G4` | Fill | 7 | 4 |
| `Z5` | Level ratio | 6 | 4 |
| `M2` | Order kept | 6 | 4 |
| `C4` | Curvature variation | 4 | 4 |
| `M5` | Distance distortion | 4 | 4 |
| `C11` | Curvature extrema | 1 | 4 |
| `H1` | Stress | 1 | 4 |
| `Z1` | Counts sum | 5 | 5 |
| `C8` | Deviation | 4 | 5 |
| `G7` | Silhouette | 2 | 6 |
| `H3` | Symmetry | 1 | 7 |

MEAS3A added `R12`, `M4`, `B7`, `M1`, `R14`, `B5`, `Z2`, `B8`, `Z9` and `B9`, ten ids of waves 1 to 3. `G5` of wave 3 and the ids of waves 4 to 7 are left.

The notes also propose new measures that MEAS0 does not have. `meas3.json` gives them the ids below.

| Id | Measure | From |
|---|---|---|
| `W1` | Ink floor | `WILD-054` |
| `W2` | Exact gap | `WILD-055` |
| `W3` | Order fragility | `WILD-056` |
| `W4` | Tracing load | `WILD-057` |
| `W5` | Ink hot spots | `WILD-058` |
| `W6` | Monotone share | `WILD-059` |
| `W7` | Lane legibility | `WILD-060` |
| `P1` | Badge overlaps | `EDA-042` |
| `P2` | Loops and fault tolerance | `NAT-003`, `NAT-020` |
| `P3` | Alignment: the count of distinct leg coordinates | `RULE-004`, `RULE-052` |
| `P4` | Highways that change between two levels | `HWY-052`, `HWY-053` |

## The corpus `screen-v2` (CORPUS-SEEDS)

The screen set `screen-v1` has 14 boards in 6 families. `hub-chain` and `many-groups` have 1 seed, and the other families have 3. Thus a selector or a portfolio cannot hold out seeds of each family. `screen-v2` is a new corpus version with 10 seeds of each family. `screen-v1` does not change, so the records of the past stay comparable.

### The seeds

| Family | Seeds | Seed rule of the member `k` | Generator |
|---|---:|---|---|
| `tiny-uniform` | 10 | `1 + 1009 k` | `fixture` 1 |
| `small-clustered` | 10 | `2 + 1009 k` | `fixture` 1 |
| `dense-groups` | 10 | `3 + 1009 k` | `fixture` 1 |
| `hub-chain` | 10 | `3 + 1009 k` | `case.hub-chain` 1 |
| `many-groups` | 10 | `7 + 1009 k` | `case.many-groups` 1 |
| `packed-grid` | 10 | `11 + 1009 k` | `case.packed-grid` 1 |

- Each family keeps the seed rule of `screen-v1`. Thus the members 0 to 2 are the boards of `screen-v1`, and the member 0 of `hub-chain` and `many-groups` is their board.
- `hubChainBoard` and `manyGroupsBoard` take the option `seed`. The seed changes only the random links. The 3 rows of 32 cards and the 32 groups of 4 cards stay, so each board keeps its hard case.
- The default seed (3 and 7) gives the old board. Thus the generator versions stay at 1.
- The files are in [`corpus/screen-v2`](../../corpus/screen-v2). `pnpm screen:inputs --set screen-v2` writes them.

### The hashes

- The hash of an input includes its id and its set. Thus the test gives each member 0 to 2 of `screen-v2` the head of `screen-v1`. Then the 14 hashes are equal to the hashes of `screen-v1`.
- The corpus hash (`corpusHashOf` of `layout-contract` 0.2.9) of `screen-v1` is `e5fe56d1069d2a18`. The corpus hash of `screen-v2` is `35795acefa7148c3`.
- A test pins the shared value of the contract. The corpus `t` with the inputs `t/a/s1` to `t/a/s3` and the hashes `h1` to `h3` gives `85baebbf77017041`.
- The manifest declares 10 inputs of each family in `claims.declared`, with `minCount` 10. `checkDeclared` of the contract passes on it.

### The split

The split file is [`corpus/splits/screen-v2.35795acefa7148c3.json`](../../corpus/splits/screen-v2.35795acefa7148c3.json), of the form `corpus-split/1`. `checkSplit` of the contract passes on it.

- The split `default` has one fold. It holds out the members 7 to 9 of each family (18 inputs) and trains on the members 0 to 6 (42 inputs).
- The split `by-member` has 10 folds. The fold `k` holds out the member `k` of each family.
- The seeds of a split file are the seeds of the specs of the manifest. Thus a fold lists the generator seeds of its members.
- Each base seed is below 1009, so two different members do not share a seed.

The members 0 to 2 are the boards of `screen-v1`. The past verdicts and the portfolio sets saw them, so they stay in the training part. The members 7 to 9 are boards that no screen saw before. Thus the held-out part is free of the choices of the past.

### The numbers

The runs are the screen of `screen-v1` of the pull request ([40738632085](https://github.com/mark1russell7/highways/actions/runs/40738632085)) and the screens of `screen-v2`. The step `router` started in [40738231081](https://github.com/mark1russell7/highways/actions/runs/40738231081), and the step `highway` in [40738642229](https://github.com/mark1russell7/highways/actions/runs/40738642229). Each run started one time on `ubuntu-latest`.

| Step | Records `screen-v1` | Time `screen-v1` | Records `screen-v2` | Time `screen-v2` | Time ratio |
|---|---:|---:|---:|---:|---:|
| `router` | 126 | 9.7 s | 540 | 36.5 s | 3.76 |
| `highway` | 784 | 158.2 s | 3360 | 644.9 s | 4.08 |

- The records of the members 0 to 2 of `screen-v2` are equal to the records of `screen-v1`. This is true for 126 of 126 records of the step `router` and 784 of 784 of the step `highway`.
- The step `router` keeps its verdicts. Its Pareto front gets `corners-smooth`, and no strategy leaves it. No router changes the sign of its B1 against `shared`.
- The step `highway` has no front on `screen-v2`. On `screen-v1`, `territories` is the only strategy without a break over the floor, so it is the front.
- On `packed-grid/s6`, `territories` has 88 pass-throughs, and `ridges` has 85. Thus `territories` goes from keep to drop.
- Each strategy of the step `highway` has a break over the floor on `screen-v2`. All of these breaks are pass-throughs on `packed-grid`, where the boxes touch.

#### The mean B1 against `shared`

The mean B1 over the inputs gives each input the same weight. `screen-v1` has 1 seed of `hub-chain` and of `many-groups` in 14 inputs, and `screen-v2` has 10 of each in 60. Thus these two families have more weight on `screen-v2`. The table also gives the mean of the family means, which gives each family the same weight.

| Strategy of the step `highway` | B1 − B1 of `shared`, mean of the inputs, `screen-v1` | `screen-v2` | Mean of the family means, `screen-v1` | `screen-v2` |
|---|---:|---:|---:|---:|
| `corridors` | −0.036 | 0.021 | 0.032 | 0.021 |
| `wspd` | −0.009 | 0.060 | 0.068 | 0.060 |
| `spiral` | −0.010 | 0.008 | 0.005 | 0.008 |
| `fdeb` | −0.016 | 0.006 | −0.007 | 0.006 |
| `sbeb` | −0.017 | 0.018 | 0.012 | 0.018 |
| `areas` | −0.013 | 0.014 | 0.005 | 0.014 |
| `consensus` | −0.058 | −0.014 | 0.002 | −0.014 |

- On the mean of the inputs, 10 highway strategies change sign. These are the first 6 of the table and `corridors+breakeven`, `corridors+stretch`, `corridors+hysteresis` and `corridors+ids`.
- On the mean of the family means, only `fdeb` (to above `shared`) and `consensus` (to below `shared`) change sign.
- Thus most changes come from the weight of the families, not from the new seeds.
- The B1 of `corridors` on `hub-chain` goes from 0.467 (1 seed) to 0.387 ± 0.054 (10 seeds). The first board of `hub-chain` is a good board for the corridors.

#### The spread over the seeds of `shared`

| Family | B1 of `shared`, `screen-v1`: mean ± sd (seeds) | `screen-v2`: mean ± sd (seeds) | Ratio of the sd |
|---|---|---|---:|
| `tiny-uniform` | 0.017 ± 0.021 (3) | 0.018 ± 0.021 (10) | 1.00 |
| `small-clustered` | 0.231 ± 0.042 (3) | 0.225 ± 0.026 (10) | 0.62 |
| `dense-groups` | 0.305 ± 0.007 (3) | 0.323 ± 0.045 (10) | 6.43 |
| `hub-chain` | 0.078 (1) | 0.041 ± 0.019 (10) | no sd on 1 seed |
| `many-groups` | 0.083 (1) | 0.083 ± 0.024 (10) | no sd on 1 seed |
| `packed-grid` | 0 (3) | 0 (10) | no B1 |

- The 3 seeds of `dense-groups` show 1/6 of the spread of its 10 seeds.
- The B1 of `shared` on `hub-chain` is 0.078 on its first board, and 0.041 on the mean of 10 boards. Thus a choice on 1 seed of a case board is not safe.

#### The prediction

| Claim | Level | Result |
|---|---|---|
| 1. The members 0 to 2 give the input hashes of `screen-v1`. The digests and the records do not change. | high | Met: 14 of 14 hashes and 910 of 910 records. The digest tests pass. |
| 2. `checkDeclared`, `checkSplit` and the pinned hash pass with the contract 0.2.9. | high | Met. |
| 3. Seeded `hub-chain` and `many-groups` keep the board of the seed 0 without a new generator version. | 0.5 | Met. |
| 4. The router screen of `screen-v2` takes 4 times or less the time of `screen-v1`. | medium | Met: 3.76 times (36.5 s against 9.7 s). |
| 5. The verdict of 2 or more highway strategies changes sign. | 0.4 | Partly met. The front verdict changes for 1 strategy (`territories`). The sign of B1 against `shared` changes for 2 strategies on the family means. |
| 6. In 3 or more families, the spread of the main measure of `shared` over 10 seeds is 2 or more times its spread over 3 seeds. | 0.35 | Partly met: 1 of the 4 families with 3 seeds (`dense-groups`, 6.43). `hub-chain` and `many-groups` had 1 seed and no spread. |

This change sets no verdict and no portfolio set. SELECT can use the split `default`: it fits on the members 0 to 6 and gets its score on the members 7 to 9.

## The verdict over families of the screens (SCREEN-WEIGHT)

Step 1 (VERDICT, #139) made the family the unit of a verdict. This step gives the families to the manifests and scores the records of both screens again with `verdict` of `layout-contract` 0.2.11.

### The families of the manifests

- The claim `claims.declared` of `screen-v1` and of `screen-v2` has `familyBy: { "*": [] }`. The key of the family is the kind of the cell, with no other dimension.
- The cells of the screen sets have no `kind`. Also, `dense-groups` and `many-groups` have the same cell. Thus a key from the dimensions of the cell gives 5 families, not 6.
- `familyCell` of `bench/screen/set.ts` gives the cell of an input with its family as `kind`. `checkFamilies` gives this hook to `checkDeclared`. No cell and no input hash change.
- `screen-v2` declares `familyMin` 10. `screen-v1` declares `minCount` 3, and `hub-chain` and `many-groups` are in `thin`, with 1 input each.
- `checkDeclared` passes on both manifests. The corpus hashes do not change, because they read only the ids and the input hashes.

### The rescore

`node scripts/screen-verdict.ts <screen.jsonl> [--default shared] [--json <out.json>]` reads the records of one artifact of the workflow `Screen`. It compares each strategy of the step with `shared`, on each guard measure of the step in [the promotion rule](../PROMOTION.md#the-measures-of-each-step).

- The tie is the `minEffect` of the measure in `MEASURES`, and the level is 0.05.
- A guard with a quantile or a limit uses that measure of each input. For example, `R5` q0.95 uses `route.detour.q95`, and `B6` max uses `route.bundle.merge-angle.max`. `R1` uses `route.crossings`.
- The script also gives the old verdict: the sign of the mean of the inputs, with the same tie.
- It gives the breadth from `families`, so it works with the contract 0.2.11. With 0.2.12, it reads the field `breadth`.

The records of `screen-v1` are the runs of `main` at `9870eac`: [40716114094](https://github.com/mark1russell7/highways/actions/runs/40716114094) (`router`) and [40716118524](https://github.com/mark1russell7/highways/actions/runs/40716118524) (`highway`). `main` has no run of `screen-v2`. Thus its records are the runs of CORPUS-SEEDS: [40738231081](https://github.com/mark1russell7/highways/actions/runs/40738231081) (`router`) and [40738642229](https://github.com/mark1russell7/highways/actions/runs/40738642229) (`highway`).

### The labels

| Set | Step | Verdicts | `better` | `worse` | `depends on the mix` | `no verdict` |
|---|---|---:|---:|---:|---:|---:|
| `screen-v1` | `router` | 40 | 11 | 16 | 1 | 12 |
| `screen-v1` | `highway` | 212 | 60 | 58 | 20 | 74 |
| `screen-v2` | `router` | 40 | 13 | 17 | 0 | 10 |
| `screen-v2` | `highway` | 212 | 81 | 90 | 0 | 41 |

- A verdict is one strategy on one guard measure. The step `router` has 8 strategies and 5 guards. The step `highway` has 53 strategies and 4 guards.
- On `screen-v2`, each family has 10 inputs. Then the mean of the family means is equal to the mean of the inputs, so no verdict is `depends on the mix`.
- On `screen-v1`, the families have 1 or 3 inputs. Thus 21 verdicts are `depends on the mix`.
- The B1 of the step `highway` gets 22, 4, 10 and 17 on `screen-v1`, and 30, 8, 0 and 15 on `screen-v2`.

### From `screen-v1` to `screen-v2`

No verdict that is `better` or `worse` on both sets changes its side: 145 of 145 stay the same. The changes are between a verdict and no verdict.

- The step `router`: 4 of 40 verdicts change, for 4 strategies. `plugs` gets `worse` on `R5` q0.95, and `corners-smooth` gets `better`. `sections-tree` gets `better` on `R1`. The `R1` of `sections` goes from `depends on the mix` to `no verdict`.
- The step `highway`: 71 of 212 verdicts change, for 41 strategies. 20 go from `no verdict` to `better`, and 31 to `worse`. 18 go from `depends on the mix` to `no verdict`, 1 to `better` and 1 to `worse`.

The changes of B1 of the step `highway`:

| Change | Strategies |
|---|---|
| `depends on the mix` to `better` | `wspd` |
| `depends on the mix` to `no verdict` | `corridors`, `spiral`, `sbeb`, `areas`, `consensus`, `corridors+breakeven`, `corridors+stretch`, `corridors+hysteresis`, `corridors+ids` |
| `no verdict` to `better` | `select`, `flow-clusters`, `soft-keys`, `ridges`, `divided`, `mesh`, `p-hub` |
| `no verdict` to `worse` | `flow-field`, `od-cells`, `scale-space`, `corridors+ambiguity` |

The B1 of `wspd` on `screen-v2` is `better` with p 0.039. The family signs are 3 wins, 2 losses and 1 tie: `better on these families, worse on 2 of 6 (1 tie)`.

### The old verdict and the new label

The old verdict is the sign of the mean of the inputs. It is different from the new label when the new label is not its side, or when a tie gets a side.

| Set | Step | Different verdicts | Strategies |
|---|---|---:|---:|
| `screen-v1` | `router` | 6 of 40 | 5 |
| `screen-v1` | `highway` | 92 of 212 | 45 |
| `screen-v2` | `router` | 4 of 40 | 3 |
| `screen-v2` | `highway` | 38 of 212 | 26 |

- On `screen-v2`, each difference is an old `better` or `worse` that becomes `no verdict`. Then an interval touches 0, or the permutation p is 0.05 or more.
- On `screen-v2`, the strategies of the step `router` are `straight` (`R11` min), `trunks` (`R5` q0.95 and `R11` min) and `sections` (`R1`).
- On `screen-v2`, 15 of the 26 highway strategies lose a B1 verdict. These are `corridors`, `quickbundles`, `spiral`, `traclus`, `nested`, `hough`, `fdeb`, `sbeb`, `areas`, `confluent`, `consensus` and the 4 riders of `corridors` without `ambiguity`.
- On `screen-v1`, 20 of the 21 verdicts that are `depends on the mix` differ from the old verdict.

### The guard count

The guard is a test that refuses a promotion when a family loses beyond the tie. This step counts the cases. It does not add the guard.

- The promotion rule has promoted no option yet. `docs/PROMOTION.md` and the roadmap list no promotion, and no record of the catalog has the field `promotion`. Thus the guard count is 0 of 0.
- Take as a proxy each strategy with 1 or more `better` guards and no `worse` guard on `screen-v2`. These are `shared-ways`, `lanes` and `soft-keys`, all of the step `highway`. Only `soft-keys` has families against it: its B1 is `better`, but 3 of 6 families are against it.
- At SCREEN-WEIGHT, 40 of the 94 `better` verdicts of `screen-v2` have 1 or more families against them. Of the 201 `better` and `worse` verdicts, 93 have.

### The prediction

| Claim | Level | Result |
|---|---|---|
| 1. All the tests of `layout-contract` pass, and the new tests pass. | high | Met: 18 of 18 in `verdict.test.ts` on the branch of 0.2.12. CI starts the full suite. |
| 2. On `screen-v2`, B1 against `shared` of the step `highway`: 25% or fewer of the strategies get `better` or `worse`. | 0.5 | Not met: 38 of 53 (72%). |
| 3. Of the `better` and `worse` verdicts of `screen-v2`, 50% or more have 1 or more family losses. | 0.45 | Not met: 93 of 201 (46%). |
| 4. The guard count is 1 to 3 of the current promotions. | 0.4 | Not met: no promotion yet, so 0 of 0. The proxy gives 1 of 3. |
| 5. Of the verdicts that are `better` or `worse` on both sets, 80% or more get the same label. | 0.45 | Met: 145 of 145 (100%). |
| 6. `checkDeclared` of 0.2.11 passes on both manifests with the new `familyBy`, with no change of a cell. | medium | Partly met: it passes with no change of a cell, but only with the hook `familyCell`. The cells cannot give the 6 families. |

## The build queue

The queue puts each idea that is not built in the order of a score (IDEA-QUEUE). Up to 3 builds at a time take the ideas from the top. An idea leaves the catalog only after its build and its screen, with its record kept.

### The files and the commands

- [`queue.json`](queue.json) has one row for each record at the stage `cataloged` or `prototyped`, and one row for each taken idea that is built.
- [`queue-taken.json`](queue-taken.json) holds the taken ideas, with the numbers of the queue at the time of the take.
- `pnpm queue` writes `queue.json`. The script is `packages/core/scripts/queue.ts`. Do not change `queue.json` by hand.
- `pnpm queue --take <id> --by <item>` takes an idea. A second take with `--strategy <name>` sets the strategy that the build made.
- `pnpm queue --calibration` gives the table of the calibration below.
- The test `packages/core/src/bench/screen/queue.test.ts` fails when `queue.json` is old.

The header of `queue.json` has the formula version, the date and the commit. It also has the files that the script read, the runs of the snapshots, the counts and the back test. The list `enablers` comes after the header, then the rows.

### The fields of a row

- `id`, `name`, `step`, `kind` and `wins` come from the record.
- `gain`, `uncertainty`, `cost` and `score` come from the formula. `rank` is the rank by score on the joint list of the ideas and the enablers.
- `slot` tells if the step has strategies in `STEPS`.
- `canonical` is the id of the canonical idea of the group. A duplicate has no rank, and it takes the status of its canonical.
- `blockedBy` gives the reasons that block a build:
  - `step:<step>`: the step has no strategies.
  - `measure:<id>`: the screen does not have the measure.
  - `idea:<id>`: an idea of `dependsOn` is not built.
- `status` is `queued`, `building` or `built`.
  - A taken idea at the stage `cataloged` or `prototyped` is `building`.
  - An idea is `built` when a registered strategy builds it, or when its take is done and its stage moved.
- `strategy` names the strategy that builds the idea. `takenAt` and `predicted` hold the date and the numbers of the take. `measured` holds the measured gain.

### The formula `queue/1`

The score is `gain × uncertainty ÷ cost`. The rank sorts the scores from high to low, then the ids.

- **The gain** is 1, plus for each named win: 0.5 and the count of the open targets on that measure.
  - An open target is a `better` verdict of the newest set of snapshots with 1 or more families against it. The newest set is `screen-v2`, and it has 40 open targets.
  - A target counts for each form of its measure. For example, the guard `B3 q0.95` counts for `B3`.
- **The uncertainty** is 1.0 for `ours`, 0.85 for `hybrid` and 0.7 for `literature`. It is 1.2 times larger when no near idea has a screen result.
- **The cost** is the size of the prototype: S 1, M 2 or L 4. The cost doubles when the cost text tells "CI only" or a slow run. It doubles again when the step has no strategies.

The draft of the formula had three gaps. The script closes them with these changes:

1. The near ideas of a record are its `related` and `same` ideas, and each record that names it in `related`. The draft did not tell the mechanism family.
2. The cost of an idea at the stage `prototyped` is half, because its code exists.
3. An idea that a registered strategy builds is `built`, and it gets no rank. `packages/core/scripts/strategy-ideas.ts` gives this map from each strategy to its ideas.

The map reads the idea ids in the text `describe` of each strategy. The list `EXTRA_LINKS` adds the links that `describe` does not give, each with its source. The site reads the same module.

### The queue on 2026-10-28

- The queue has 195 rows: 184 canonical ideas and 11 duplicates. 183 ideas have a rank.
- `HWY-031` and its rider `WILD-030` are `built`. The strategy `corridors` builds them (HWY-STEP, #67). Its stage stays `prototyped` until the screen of `HWY-031`.
- 77 of the 183 ranked ideas are blocked:
  - 51 by a step with no strategies: `whole` 27, `levels` 18 and `plugs` 6.
  - 21 by a measure that the screen does not have. For 17, the measure is the only block.
  - 17 by an idea of `dependsOn`.
- 94 of the 183 ranked ideas have no near idea with a screen result.

The top 10:

| Rank | Idea | Step | Score | Blocked by |
|---:|---|---|---:|---|
| 1 | `NAT-018` Knee of the plant Pareto front | `highway` | 20.825 | |
| 2 | `RULE-021` Simulated annealing over candidate routes | `router` | 18.7 | |
| 3 | `NAT-019` Bronchial space-filling splits | `highway` | 17.85 | |
| 4 | `EDA-017` Stretch balance in a bundle | `highway` | 13.175 | |
| 5 | `WILD-023` Tight edges first | `router` | 12.5 | |
| 6 | `RULE-044` Corner graph with rule prices, then rip-up and reroute | `router` | 12 | |
| 7 | `WILD-036` Manifolds for a fan to a row | `highway` | 12 | |
| 8 | `WILD-031` Approval corridors | `highway` | 11.75 | |
| 9 | `RULE-020` Adam with a seeded sample of pairs | `router` | 11.73 | `idea:RULE-019` |
| 10 | `RULE-047` Pull toward the lane slots of the highway skeleton | `highway` | 11.5 | |

The [results page](https://mark1russell7.github.io/highways/results.html) shows the top 20 and the count of each status.

### Queue calibration

The calibration compares the predicted gain of each taken idea with its measured gain after its screen. The lead updates this section each month with `pnpm queue --calibration`.

- `predicted` is frozen at the take. A new formula does not change it.
- The measured gain uses the scale of the gain: 1, plus for each named win:
  - 0.5 when a guard of the win is `better` for the strategy in the newest set.
  - 1 for each open target of an other strategy on that measure that the strategy closes.
- The strategy closes a target when, on the guard of the target, it wins on each family against the target.
- The test checks that each taken idea that is built has `predicted` and `measured`.
- The rank correlation (Spearman) comes when 5 or more taken ideas are built.

On 2026-10-28, no taken idea is built. The back test applies the formula to the 55 ideas that a strategy builds and that have a screen result. These are from before the queue. Their rank correlation is 0.39.

At the build of the queue (#147), the back test had 50 ideas and 0.50. The map of #148 and the screens after it added 5 ideas. The predicted gain of the back test does not count the open targets of the strategy itself.

The bootstrap interval of 95 % of the back test is 0.11 to 0.62. With the 50 ideas of #147, it was 0.23 to 0.72. The script takes 2000 resamples of the pairs, with replacement and the fixed seed 1. The interval is the 2.5 and the 97.5 percentile. The header of `queue.json` holds it as `backtest`, and the results page shows it.

| Idea | Taken | Predicted gain | Predicted score | Measured gain |
|---|---|---:|---:|---:|

### The prediction

| Claim | Level | Result |
|---|---|---|
| 1. 7 or more of the draft top 10 stay in the final top 10. | 0.5 | Met: 9 of 10. Only `HWY-031` left, because `corridors` builds it. `RULE-020` came in at rank 9. |
| 2. 15% or more of the ranked ideas have a `blockedBy`. | 0.45 | Met: 77 of 183 (42%). |
| 3. The results page grows by 5 KB gzip or less. | high | Met by an estimate: the changed sources and the data grow by 1.8 KB gzip. The Pages build of CI gives the true size. |
| 4. No route output, digest or Xplat hash changes. | high | Met: the change adds scripts and tests only, and no file of `packages/core/src` outside the tests. |

### The enablers (`queue/2`)

An enabler is an item that removes a block of ideas (QUEUE-ENABLERS). It gets a score on the same list as the ideas. The formula `queue/2` is `queue/1` with the enablers on the list.

- The list `ENABLERS` of `packages/core/scripts/queue.ts` gives each enabler: its id, the blocks that it removes and its size.
- The score of an enabler is the sum of the scores of the ideas that it unblocks, divided by its cost. The cost is the size: S 1, M 2 or L 4.
- The enabler unblocks an idea when it removes each block of the idea. A block `idea:<id>` is removed when the enabler unblocks that idea. The script repeats this until no idea changes.
- An idea with the blocks of two enablers needs both. Neither enabler gets its score.
- The scores of the unblocked ideas are the scores of the list. They keep the double cost of a step with no strategies.
- The ideas and the enablers sort together by score, then by id. A rank is unique on the joint list.

The enablers at the build (QUEUE-ENABLERS, before STEP-SLOTS):

| Enabler | Removes | Size | Unblocks | Sum of the scores | Score | Rank |
|---|---|---|---:|---:|---:|---:|
| `STEP-SLOTS` | `step:` (the steps `whole`, `levels` and `plugs`) | L | 45 | 105.279 | 26.32 | 1 |
| `SCREEN-MEASURES` | `measure:` (11 measures) | L | 17 | 35.67 | 8.918 | 18 |

- `STEP-SLOTS` unblocked 45 of the 51 ideas with a step block. 6 of the 45 waited for an idea that `STEP-SLOTS` also unblocked.
- 4 ideas needed both enablers: `WILD-011`, `WILD-013`, `EDA-014` and `EDA-036`.

STEP-SLOTS (#154) is built. It added a slot for each of the steps `plugs`, `levels` and `whole`, so no block `step:` is left. It left the list `ENABLERS`. A built enabler leaves the list, because it removes no block.

- The blocked ideas went from 77 to 38: 21 by a measure and 17 by an idea.
- The ideas of the three steps lost the double cost of a step with no strategies. Their scores doubled.

The enabler on 2026-10-28, after STEP-SLOTS:

| Enabler | Removes | Size | Unblocks | Sum of the scores | Score | Rank |
|---|---|---|---:|---:|---:|---:|
| `SCREEN-MEASURES` | `measure:` (11 measures: `C4`, `C8`, `G4`, `G5`, `G7`, `H3`, `M2`, `M3`, `M5`, `Z1` and `Z5`) | L | 21 | 41.508 | 10.377 | 19 |

- `SCREEN-MEASURES` unblocks each of the 21 ideas with a measure block. For each one, the measure is the only block.
- `SCREEN-MEASURES` gets a low score because a missing measure has no open targets. Each win on it adds only 0.5 to the gain.

The joint top 10 after STEP-SLOTS:

| Rank | Item | Step | Score | Blocked by |
|---:|---|---|---:|---|
| 1 | `NAT-016` Closed venation backbone for levels | `levels` | 21.42 | |
| 2 | `NAT-018` Knee of the plant Pareto front | `highway` | 20.825 | |
| 3 | `RULE-021` Simulated annealing over candidate routes | `router` | 18.7 | |
| 4 | `NAT-019` Bronchial space-filling splits | `highway` | 17.85 | |
| 5 | `RULE-048` A curriculum that adds the rules one at a time | `whole` | 13.8 | `idea:RULE-019` |
| 6 | `WILD-016` Bundle level of detail | `levels` | 13.2 | `idea:WILD-060` |
| 7 | `WILD-045` A portfolio for each board | `whole` | 13.2 | |
| 8 | `EDA-017` Stretch balance in a bundle | `highway` | 13.175 | |
| 9 | `WILD-023` Tight edges first | `router` | 12.5 | |
| 10 | `RULE-044` Corner graph with rule prices, then rip-up and reroute | `router` | 12 | |

### The prediction of QUEUE-ENABLERS

| Claim | Level | Result |
|---|---|---|
| 1. `STEP-SLOTS` gets rank 1, with a score of 2 or more times that of `NAT-018` (41.65 or more). | 0.45 | Not met: rank 1, but the score is 26.32 (1.26 times). |
| 2. `SCREEN-MEASURES` gets a rank from 2 to 10. | 0.4 | Not met: rank 18. |
| 3. 10 or fewer ranked ideas have a step block and a measure block. | 0.5 | Met: 4. |
| 4. The lower bound of the bootstrap interval of 95 % is above 0.2. | 0.5 | Met at the build: 0.23 over 50 ideas. After #148, the back test has 55 ideas, and the lower bound is 0.11. |
| 5. No route output, digest or Xplat hash changes. | high | Met: the change adds scripts, tests and site code only. |

## Queue builds

BUILD-QUEUE takes the ideas from the top of the queue (direction 10). Each build screens its idea alone and with the gate `stretch`, on `screen-v1` and `screen-v2`. The table gives the label against `shared` and the breadth (the families against, of 6) on each named win. The ratios are the median of the paired ratio candidate/`shared` on `screen-v2`.

| idea | strategy | B1 v1 | B1 v2 | B2 v1, v2 | B3 q0.95 v1, v2 | B8 runs v1, v2 | B1 ratio | B3 q95 ratio | time ratio v1, v2 | new hard-rule breaks | stage |
|---|---|---|---|---|---|---|---:|---:|---|---:|---|
| `HWY-031` (with `WILD-030`) | `corridors` | depends on the mix, 2 | no verdict, 3 | no verdict, 2 and 2 | better, 1 and 1 | no verdict 3, better 3 | 1.000 | 1.000 | 1.83, 1.92 | 0 | `screened` |

### BUILD-Q1: the corridor signatures (`HWY-031`)

- HWY-STEP ([#67](https://github.com/mark1russell7/highways/pull/67)) built this idea as the strategy `corridors`. The strategy has its folder, its tests, a schema for each param of the record and a row in the benchmark. BUILD-Q1 adds no strategy. It adds the screen module `packages/core/scripts/screens/build-q1.ts` with the params of the record.
- The runs: [40764071893](https://github.com/mark1russell7/highways/actions/runs/40764071893) (`screen-v1`) and [40764744994](https://github.com/mark1russell7/highways/actions/runs/40764744994) (`screen-v2`).
- `corridors` saves more ink than `shared` on hub-chain and many-groups, where `shared` bundles almost nothing. It saves less on dense-groups and small-clustered (B1 0.118 against 0.323 on dense-groups of `screen-v2`). Thus B1 has no side.
- B3 q0.95 is `better` on both sets. Only many-groups is against it (1.017 against 1.000 on `screen-v2`).
- The gate `stretch` removes no member, so `corridors+stretch` has the same labels.
- No variant gives B1 a side. The near links within one lane (`near` 4) have the best B1 of the variants (stratified mean +0.034 on `screen-v2`, p 0.16). The signature with 128 hashes in 16 bands finds fewer pairs, and it is `worse` on B1.
- The idea is not `better` on B1, so it is not kept. No named win is `worse`, so it is not dropped. Its stage is `screened`.

## Wave 3G (BUILD-W3G)

Wave 3G builds six ideas: `steiner` (HWY-036), `attraction` (HWY-044), `gaps` (HWY-057), `streets` (HWY-058), `search` (HWY-059) and `interchanges` (HWY-060).
Each strategy is screened alone, with the gate `stretch`, and with one or two changes of its options. The verdict is the verdict over families of `scripts/screen-verdict.ts` against `shared`, on the named wins of the idea.

The records are the runs at `a32522f`:

- The step `highway`: [40764832307](https://github.com/mark1russell7/highways/actions/runs/40764832307) on `screen-v1` and [40761862381](https://github.com/mark1russell7/highways/actions/runs/40761862381) on `screen-v2`.
- The step `router`: [40766283584](https://github.com/mark1russell7/highways/actions/runs/40766283584) on `screen-v1` and [40767715430](https://github.com/mark1russell7/highways/actions/runs/40767715430) on `screen-v2`.

### The rule of the stage

- An idea is `kept` when each named win with a value is `better` on `screen-v2` with 0 families against it. It also has no `worse` named win on `screen-v1`, and 0 new hard-rule breaks.
- An idea is `dropped` when the screen shows that its own move gives no gain over its start.
- Each other idea stays `screened`.
- A new hard-rule break is a break on an input where `shared` has fewer breaks of the same rule.

### The results

A cell gives the label and the breadth: the families against, of 6, and the ties. The ratios are the paired ratios of the candidate over `shared` on `screen-v2`, as the median and the maximum. An input where `shared` has 0 gives no ratio. The time ratio is the median time over the median time of `shared` on `screen-v2`.

| Idea | Named wins on `screen-v1` | Named wins on `screen-v2` | B1 ratio | B3 q95 ratio | Time | New hard-rule breaks | Stage |
|---|---|---|---:|---:|---:|---|---|
| HWY-036 `steiner` | B1 `no verdict` 2 of 6, R14 `better` 2 of 6, B2 `better` 0 of 6 | B1 `better` 1 of 6, R14 `better` 1 of 6, B2 `better` 0 of 6 | 2.108 / 388.5 | 1.146 / 1.418 | 2.30 | 10 `no-pass-through` on 6 inputs of `packed-grid` (2 on `screen-v1`) | `screened` |
| HWY-057 `gaps` | R14 `better` 0 of 6 (1 tie), M4 `depends on the mix` 2 of 6, B1 `better` 0 of 6 (1 tie) | R14 `better` 0 of 6 (1 tie), M4 `no verdict` 2 of 6, B1 `better` 0 of 6 (1 tie) | 5.282 / 30.16 | 1.084 / 1.347 | 1.95 | 0 | `screened` |
| HWY-058 `streets` | R14 `better` 0 of 6 (1 tie), B1 `better` 0 of 6 (1 tie), R3 `worse` 1 of 6 | R14 `better` 0 of 6 (1 tie), B1 `better` 1 of 6 (1 tie), R3 `worse` 1 of 6 | 1.741 / 39.10 | 1.105 / 1.376 | 2.25 | 0 | `screened` |
| HWY-059 `search` | B1 `depends on the mix` 2 of 6, B3 q95 `better` 1 of 6, B4 `depends on the mix` 2 of 6, B6 `better` 0 of 6 | B1 `no verdict` 2 of 6, B3 q95 `better` 1 of 6, B4 `no verdict` 3 of 6, B6 `better` 1 of 6 | 1.000 / 19.72 | 1.000 / 1.028 | 19.4 | 0 | `dropped` |
| HWY-060 `interchanges` | B1 `better` 0 of 6 (1 tie), B8 runs `worse` 0 of 6 (1 tie) | B1 `better` 0 of 6 (1 tie), B8 runs `worse` 0 of 6 (1 tie) | 1.450 / 28.75 | 1.019 / 1.298 | 3.03 | 0 | `screened` |
| HWY-044 `attraction` | B1 `better` 0 of 6 (3 ties), B8 runs `worse` 0 of 6 (3 ties), M4 `no verdict` 1 of 6 | B1 `better` 0 of 6 (3 ties), B8 runs `worse` 0 of 6 (3 ties), M4 `no verdict` 0 of 6 | 1.000 / 3.460 | 1.000 / 1.033 | 2.76 | 0 | `screened` |

- `steiner` gives the most B1 of the wave, but it adds routes through boxes on `packed-grid`. With the gate `stretch`, the breaks go to 0, and B1 has no verdict with 4 of 6 families against.
- `gaps` raises M4 from 0 to 32.3 on `many-groups`. Thus its named win M4 fails. With `minSize: 2`, the labels stay the same.
- `streets` raises the bends (R3) by 24% to 49% on 4 of 5 families with bends.
- `search` starts at `corridors`. Against `corridors`, its median B1 ratio is 1.000, and 0.998 with 48 evaluations at 45 times the time of `shared`. Its `better` B3 q95 and B6 come from the start plan.
- `search` reads only the graph and the routes of its input. Its score does not read the records of a screen. The option `evaluations` (0 to 400, default 16) sets its budget.
- On both sets, `interchanges` gets B1 `better` with 0 families against. Its only loss is B8 runs. It gets a new screen after MEAS-FLAT corrects B8 runs.
- On both sets, `attraction` gets B1 and R1 `better` with 0 families against. The B1 gain is 0.003 on the mean of the families. B8 runs is `worse`, and R4, R5 and the B3 q95 are a little worse on `screen-v2`.
- The time of `attraction` is 2.63 times `shared` on `screen-v1`. Thus the workflow `Scale` times it on the dense board of 1000 boxes.

### The snapshots of the verdicts

The snapshots of [`verdicts/`](verdicts/README.md) hold the screens of this wave, with all the built-in strategies and the strategies of the wave.

- Over all the `better` verdicts of `screen-v2`, 61 of 139 have 1 or more families against them. Over all the `better` and `worse` verdicts, 132 of 294 have.
- The results page reads these counts. A new screen in a snapshot changes them.

### The measures with no value

- Z9 has no value for a plan of the step `highway`. The records have no `route.level.link-agreement`.
- Z2 is 0 on each record.
- B8 runs is 0 for `shared` on `hub-chain` and `many-groups` (MEAS-FLAT). Thus each strategy that makes a run there is `worse` on B8 runs.

## Gaps

- The screen does not have `G5` and the 12 ids of waves 4 to 7 yet.
- The near pairs are a judgment. BUILD-W can find more pairs while it builds. Then it adds them to `related` or to a group.
- The stage of each record is `cataloged`. The screen results of BUILD-W move the stages.
