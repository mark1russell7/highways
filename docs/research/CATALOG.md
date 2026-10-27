# The idea catalog

This note joins the ideas of the five research notes into one catalog (IDEA0). BUILD-W builds and screens the ideas in the waves of this note.

## Summary

- The catalog has 273 records in five family files. 24 groups hold the same idea in two or three families, so the catalog has 248 distinct ideas.
- Each record has a stage. Today each record is at the stage `cataloged`. No idea leaves the catalog without a screen result.
- The three forms of the merge-angle law agree. The router `shared` follows a different model: a greedy Snell merge with a fixed charge.
- The build order has seven waves. Wave 1 holds 11 cheap ideas that need no new step. Wave 2 holds 17 ideas of the step `highway`.
- The ideas need 26 measures of MEAS0 that the screen does not have yet. MEAS3 adds them, and the first three are `B2`, `B3` and `B6`.

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
| `cataloged` | 273 |
| `screened`, `prototyped`, `built`, `kept` and `dropped` | 0 |

## The duplicate groups

Each note was written without the others. Thus some ideas are in two or three notes. A group holds the records with the same mechanism. The first id is the canonical. The other records keep their text, because each note adds its own details.

| Canonical | Same idea | Wave | Why it is one idea |
|---|---|---|---|
| `EDA-029` | `HWY-038`, `HWY-039` | 1 | The cost `f^α` on shared links. `HWY-039` is the same concave cost with rip-up. |
| `WILD-002` | `NAT-031` | 1 | Even spacing of the plugs on a side. |
| `NAT-024` | `WILD-022` | 1 | The order in which the routes go. |
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
| 2 | 17 | 24 | `B1`, `B2`, `B8`, `B3`, `Z10`, `B6` | 15, 2, 0 | The step `highway` (HWY-STEP) |
| 3 | 43 | 48 | `B1`, `B8`, `B2`, `B4`, `B7`, `R1` | 13, 27, 3 | Wave 2, and the step `follow` for some ideas |
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

The ideas of wave 2 are strategies of the step `highway`. HWY-STEP makes this step at this time. The corridor signatures (`HWY-031`) and the merge points (`HWY-050`) come first.

- **Expected wins.** `B1`, `B2`, `B8`, `B3`, `Z10` and `B6`.
- **The screen that decides.** Five boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). The baselines are `corners`, `shared` and `trunks`. An idea stays when it is better than `shared` on 3 of 5 boards. Better means a `B1` at least as high and a `B3` q95 at most as high.
- **Cost.** 15 small prototypes and 2 medium prototypes.

### Wave 3: the other highway ideas

Wave 3 holds the other ideas of the highway note. The ideas of tier 2 come first, then tier 3.

- **Expected wins.** `B1`, `B8`, `B2`, `B4`, `B7` and `R1`.
- **The screen that decides.** The five boards of wave 2, with the same baselines.
- **Cost.** 13 small, 27 medium and 3 large prototypes. The ideas that follow a highway need the step `follow`, which does not exist yet.

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
| 3 | NAT-024 (with WILD-022) | Pioneer and follower order | `router` | B1, B2, R5 | S |
| 4 | WILD-001 | Free plugs on a side | `plugs` | R3, R4, R10 | M |
| 5 | WILD-002 (with NAT-031) | Plug justification | `plugs` | R11, R1, R10 | S |
| 6 | EDA-004 | Constrained left-edge tracks in each gap | `room` | M1, M4, R12 | S |
| 7 | RULE-046 | One repair step for the hard rules after any method | `router` | R9, Z2, Z3 | S |
| 8 | EDA-029 (with HWY-038, HWY-039) | Branched transport cost (Gilbert flow cost) | `highway` | B1, B2, B7 | S |
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

The `MEASURES` table of the screen (`packages/core/src/bench/screen/measures.ts`) has 34 ids of MEAS0. The ideas use 26 more ids of [MEAS0](MEASURES.md). [`ideas/meas3.json`](ideas/meas3.json) lists them. When the screen adds an id, the id leaves `meas3.json`, and the test makes sure of it.

| Id | Measure | Ideas | First wave |
|---|---|---|---|
| `B3` | Bundle stretch | 61 | 1 |
| `B2` | Bundled share | 50 | 1 |
| `R12` | Lane separation | 44 | 1 |
| `M4` | Lane routes through boxes | 33 | 1 |
| `B7` | Occupied area | 24 | 1 |
| `B6` | Merge angle | 23 | 1 |
| `M1` | Area | 23 | 1 |
| `R14` | Orthogonality | 22 | 1 |
| `B5` | Lane crossings | 17 | 1 |
| `Z2` | Link ends | 1 | 1 |
| `B8` | Run profile | 23 | 2 |
| `Z9` | Link agreement | 21 | 2 |
| `B9` | Lane fidelity | 22 | 3 |
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

`M1` and `M4` are values of the suite already. Only the table of the screen does not have them.

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

## Gaps

- The screen does not have `B2`, `B3` and `B6` yet. Wave 1 needs them, so MEAS3 comes before wave 1 or with it.
- The step `follow` does not exist. Some ideas of wave 3 need it.
- The near pairs are a judgment. BUILD-W can find more pairs while it builds. Then it adds them to `related` or to a group.
- The stage of each record is `cataloged`. The screen results of BUILD-W move the stages.
