# Grouping rules for the zoom levels

This note is the research item GRP-R of the [roadmap](../ROADMAP.md). It gives the rules that put boxes in groups at each zoom level, and the options that tune them.

A grouping rule is a strategy of the step `group`. It takes a graph and gives a tree of sections. The router `sections` makes its hubs and its zoom levels from that tree. The later items use this note:

- GRP2 builds the rules of the [build order](#the-build-order-for-grp2), each in its folder, with its tests and a row in the benchmark.
- TUNE sweeps the options of each rule against the group measures of [MEAS0](MEASURES.md#groups) and the zoom-level measures of [MEAS0](MEASURES.md#zoom-levels).

## Summary

- The note gives 19 grouping rules in four kinds. Spatial trees have 5, clusters of positions 4, communities of links 6 and mixed rules 4.
- Each rule has its objective, its cost class, its options, the measures that it makes better, its nesting and its stability under a small change.
- The rule `quadtree` of today reads the positions only. It puts each cut at the middle of its cell, so a cut can go through a dense cluster.
- A guillotine rule that puts each cut where it crosses the fewest links cuts fewer links at the far view. A scratch run gives a lower cut share on 8 of 10 boards at the same number of items. The literature gives the reason: a partition that reads the edges cuts fewer edges than a partition that reads only the coordinates.
- The communities of links (Louvain, Leiden) put the most links inside the groups, but their groups are not regions of the board. A rule for this library must give nested regions, so the note adds the positions to them.
- The [build order](#the-build-order-for-grp2) has 5 rules: `kd`, `cut`, `agglomerative`, `leiden` and `pack`.

## How to read an entry

### Notation

- `n` is the number of nodes, and `m` is the number of edges (links). `k` is the number of items of a level.
- `c_v` is the center of the box of the node `v`. `u` is the unit of length of a board, as in [MEAS0](MEASURES.md#notation).
- `cut(A, B)` is the number of edges with one end in `A` and one end in `B`. `vol(A)` is the sum of the degrees of the nodes of `A`.
- The far view is the first level with more than one item. The bench names its number of items `farItems`.
- The measures G1 to G9 and Z1 to Z10 are the measures of [MEAS0](MEASURES.md). Their cost classes are the cost classes of [MEAS0](MEASURES.md#cost-classes).

### The columns of the rule tables

| Column | Meaning |
|---|---|
| Id | The id of the rule in this note. |
| Rule | The name of the rule, and its id in GRP2 when it is in the build order. |
| Objective | The value that the rule makes small or large, in code font. |
| Cost | The time to make the whole tree, for `n` nodes and `m` edges. |
| Measures | The MEAS0 measures that the rule makes better. A measure in parentheses is one that the rule ignores. |
| Nests | `native`: the rule gives a tree of regions. `force`: the [nesting section](#make-the-groups-nest-and-stay-in-one-region) tells how to get one. |
| Stability | The change of the groups after one node moves by `u`, or after one edge is added or removed (G9). |

## What a grouping rule must give

The router reads the tree of sections, so a rule must give a valid tree. The library and MEAS0 add more conditions. Each condition has its measure:

| Condition | Why | Measure |
|---|---|---|
| A valid tree | `checkSections` examines each tree of a consumer rule. Each node is in exactly one leaf, and a child is one level deeper than its parent. | the error of `checkSections` |
| Nested levels | An item of a level is a part of one item of the level before it. Thus a zoom keeps the mental map. | Z6, the proposed rule `level-nesting` |
| One region for each group | A level item is the bounding box of its nodes. A group in two places gives a large box that covers other groups. | G4, G5 |
| No overlap of the items | `levelLinks` routes around the items. Items that overlap make a walled-in level, as in ER3d. | G5 |
| Few links between the items | Each link of a level is a line on the far view. Fewer links give a calmer view. | G2, G1, G8 |
| Even steps from level to level | `pickLevel` picks a level by the median size of its items. Even steps give a smooth zoom. | Z5, G6 |
| The same groups after a small change | A host draws the board again after an edit. Stable groups keep the far view of the reader. | G9, Z7, Z8 |

[Elmqvist 2010][elmqvist10] gives the same rules for a hierarchy of aggregates: a summary, a visual separation and a fidelity to the data. [Eades 1996][eades96] draws each cluster of a clustered graph as one region, and the regions nest. [Misue 1995][misue95] names the parts of the mental map: the order, the proximity and the topology.

## The rule of today

`buildSections` makes the tree of the rule `quadtree` ([Finkel 1974][finkel74]). A cell with more than `cap` nodes splits in four at its middle. A cell with all its nodes in one quarter becomes that quarter, at most `collapse` times. The tree stops at `maxDepth`. The rule `keys` makes one group for each key of the nodes, and its option `split` adds a quadtree below a large group.

The quadtree has good properties:

- Its cells nest, do not overlap and cover the board. Thus Z6 is 0, and G5 counts only the overhang of the boxes.
- It is `n log n` and deterministic.
- A fan-out of 4 gives an even level ratio (Z5) on an even board.

It also has known defects:

- It reads no edge. A midline can go through a dense cluster and cut each edge of the cluster.
- The midline does not move to a gap between the boxes. A row of boxes on the midline goes to two cells.
- The root cell is the bounding box of the nodes. When the outermost node moves, each midline moves, and many nodes change their cell.
- One node more in a cell at `cap` splits the cell. Thus one added node can add three items to a level.

## Spatial trees

A spatial tree splits the plane into rectangles. Each rule of this kind gives nested regions, so Z6 is 0. None reads the edges. [Samet 2006][samet06] surveys these trees.

| Id | Rule | Idea | Objective | Cost | Measures | Nests | Stability | Source |
|---|---|---|---|---|---|---|---|---|
| S1 | Quadtree (`quadtree`, today) | Split a cell with more than `cap` nodes into four quarters at its middle. | None. The cells have a fixed shape. | `n log n` | G4, G5, Z5 (G1, G2, G8) | native | High inside a cell. Low when the root box changes or a cell crosses `cap`. | [Finkel 1974][finkel74] |
| S2 | Grid pyramid | Cut the board into square cells of side `s`, then `2s`, then `4s`. Each level merges 2 × 2 cells. | None | `linear` | G4, G5, Z5 (G1, G2, G6) | native | The highest. A node changes its group only when it crosses a cell line. | [Samet 2006][samet06] |
| S3 | k-d tree (`kd`) | Split a cell in two with a line across its longer side. The line goes at the median, the middle, or the middle that slides to the nearest node. | Median: equal halves. Sliding middle: no empty half and no thin cell. | `n log n` with a sort for each axis | G6, G4, G5, Z5 (G1, G2) | native | Medium. A median moves by one rank when one node moves. | [Bentley 1975][bentley75], [Maneewongvatana 1999][maneewongvatana99] |
| S4 | STR packing (`pack`) | Sort by `x`, cut into `sqrt(n / b)` slices, sort each slice by `y`, and fill leaves of `b` nodes. Repeat on the leaf boxes. | Full leaves, little overlap of the leaf boxes | `n log n` | G6, G4, speed (G1, G2, G5) | native, bottom up | Low. One added node moves the runs of each later leaf. | [Leutenegger 1997][leutenegger97], [Guttman 1984][guttman84] |
| S5 | Hilbert packing (`pack`) | Sort the centers along a Hilbert curve, and cut the order into runs of `b` nodes. Repeat on the runs. | Runs that stay near on the board | `n log n` | G6, G7, speed (G1, G2, G5) | native, bottom up | Low. One added node moves the run boundaries after it. | [Kamel 1994][kamel94] |

### Notes on the spatial trees

- S3 to S5 can fill a level with exactly `k` items. The quadtree and the grid cannot, because a cell can be empty.
- The leaves of S4 and S5 are full, so G6 is near 1. But their boxes can overlap, and a leaf can be long and thin. The quadtree and S3 have neither defect.
- [Bederson 2002][bederson02] measured the same trade on treemaps. The slice-and-dice layout, a guillotine layout with a fixed order, was the most stable. The squarified layout had the best shapes and the least stability.
- S3 with a fan-out of 4 splits each cell two times, first across its longer side and then across each half. Then its levels have the same ratio as the quadtree.

## Clusters of positions

These rules read the centers `c_v` only. They find the groups that the host layout already shows. None reads the edges. [Murtagh 2012][murtagh12] and [Müllner 2011][mullner11] survey the agglomerative rules and their costs.

| Id | Rule | Idea | Objective | Cost | Measures | Nests | Stability | Source |
|---|---|---|---|---|---|---|---|---|
| P1 | k-means and k-medoids | Move `k` centers to the mean (or the medoid) of their nodes until no node changes its center. | `Σ_v dist(c_v, center(v))^2`, or the sum of distances for medoids | k-means `O(n k t)` for `t` steps. PAM is `quadratic`. | G7, G4 (G1, G2, G5) | force: split each group again (bisecting k-means) | Medium. A node near a boundary changes its group. The seed of the first centers changes the result. | [Arthur 2007][arthur07], [Schubert 2019][schubert19] |
| P2 | Agglomerative (`agglomerative`) | Start with each node alone. Merge the two nearest groups, again and again. The linkage gives the distance of two groups. | Ward: the smallest growth of `Σ dist(c_v, mean)^2`. Average: the mean pair distance. Single: the nearest pair. | `quadratic` for each pair. `n log n` on a sparse graph of neighbours. | G7, G4 (G1, G2) | native: the merge tree | Ward and average: medium. Single: low, because one node between two groups merges them (chaining). | [Ward 1963][ward63], [Müllner 2011][mullner11] |
| P3 | DBSCAN and HDBSCAN | A dense area is a group. A node with `minPts` nodes within `eps` is a core node. HDBSCAN builds the tree of all values of `eps`. | Density, with no fixed `k` | `n log n` with a spatial index | G4, G7 (G1, G2, G6) | HDBSCAN: native. DBSCAN: force. | DBSCAN: low at the value `eps`. HDBSCAN: medium, because it keeps only the groups that live over a range of densities. | [Ester 1996][ester96], [Campello 2013][campello13] |
| P4 | Mean shift | Move each point up the density to its mode. The nodes with one mode make one group. | The modes of the density with the bandwidth `h` | `O(n^2 t)`, or `O(n t)` with bins | G4, G7 (G1, G2, G6) | force: a larger `h` on the modes of the level below | Medium. The modes move little after a small move of one node. | [Comaniciu 2002][comaniciu02] |

### Notes on the clusters of positions

- On a board where the host places linked boxes near each other, P1 to P4 also cut few edges. On a packed grid, they find no clusters, and they cut as many edges as a grid.
- P2 with Ward linkage gives compact, round groups. Single linkage follows chains of boxes, so a group can be long and thin.
- P3 gives noise nodes. Each noise node is a group alone, as a node without a key in the rule `keys`.
- A group of P1 to P4 is a convex region (P1) or a region of any shape. The bounding boxes of two groups can overlap, so G5 needs a check.

## Communities of links

These rules read the edges only. They put the nodes with many shared edges in one group. [Fortunato 2010][fortunato10] surveys them. A group of these rules can be in many places on the board. Thus each rule needs the positions to be a grouping rule of this library.

| Id | Rule | Idea | Objective | Cost | Measures | Nests | Stability | Source |
|---|---|---|---|---|---|---|---|---|
| L1 | Louvain | Move each node to the neighbour group with the largest gain of modularity. Then merge each group to one node and repeat. | `Q = Σ_c (e_c / m - γ (d_c / 2m)^2)` (G1, with the resolution `γ`) | near `linear` in `m` for each pass | G1, G2 (G4, G5, G7) | native: one level for each pass. Not regions. | Low. The order of the nodes changes the result. `Q` has many near-optimal partitions. | [Blondel 2008][blondel08], [Good 2010][good10] |
| L2 | Leiden (`leiden`) | Louvain with a step that refines each group. Each group is connected in the graph. | `Q` or the Constant Potts Model with `γ` | near `linear` in `m` | G1, G2, G3 (G4, G5, G7) | native: one level for each pass. Not regions. | Medium. A seed fixes it. Consensus over runs makes it better. | [Traag 2019][traag19], [Reichardt 2006][reichardt06] |
| L3 | Label propagation | Each node takes the label that most of its neighbours have, until no label changes. | None. It finds a local agreement. | `linear` for each step | G1 in part (G4, G5, G7) | force: start it again inside each group | The lowest. Ties break at random, and two seeds can give very different groups. | [Raghavan 2007][raghavan07] |
| L4 | Infomap | Find the groups that give the shortest code for a random walk on the graph. | The map equation `L(M)` | near `linear` in `m` for each trial | G1, G3 (G4, G5, G7) | native with the hierarchical map equation. Not regions. | Medium. It makes many trials and keeps the best. | [Rosvall 2008][rosvall08], [Rosvall 2011][rosvall11] |
| L5 | Spectral cut | Split the graph by the sign of the second eigenvector of the normalized Laplacian. Repeat in each part. | Normalized cut `cut(A, B) / vol(A) + cut(A, B) / vol(B)` | `O(m t)` for each split with Lanczos steps | G2, G3, G8 (G4, G5) | native: recursive splits. Not regions. | High when the eigengap is large. Low when two eigenvalues are near. | [Shi 2000][shi00], [von Luxburg 2007][luxburg07] |
| L6 | Recursive sparsest cut | Split each group by its sparsest cut, then split each part again. | `cut(A, B) / (abs(A) · abs(B))`. It approximates the tree cost of Dasgupta (G8). | The exact cut is NP-hard. The spectral step of L5 approximates it. | G8, G2 (G4, G5) | native. Not regions. | Depends on the cut solver | [Dasgupta 2016][dasgupta16], [Charikar 2017][charikar17], [Cohen-Addad 2019][cohenaddad19] |

### Notes on the communities of links

- The tree cost of [Dasgupta 2016][dasgupta16] charges each edge the size of the group where the tree splits its ends. An edge that the root cuts costs `n`. Thus a tree with a low cost cuts few edges at the top, and the far view is the top.
- The recursive sparsest cut is an `O(α_n)` approximation of that cost, with `α_n = O(sqrt(log n))` the factor of the cut solver ([Charikar 2017][charikar17]). [Cohen-Addad 2019][cohenaddad19] gives a class of good tree costs, and Dasgupta's cost is one of them.
- [Moseley 2023][moseley23] studies the dual of the cost. Average linkage on the edge weights is a 1/3 approximation of that dual. Bisecting k-means can be far from the best tree. Thus P2 with average linkage is a sound rule on the links, and P1 is not.
- `Q` has a resolution limit: it cannot find a group with fewer than approximately `sqrt(2m)` edges ([Fortunato 2007][fortunato07]). The resolution `γ` of L1 and L2 sets the size of the groups, so a ladder of values of `γ` gives a ladder of levels.
- [Good 2010][good10] shows that `Q` has many partitions near its maximum, and these partitions can differ much. Thus G9 of L1 is low unless a consensus step merges runs ([Lancichinetti 2012][lancichinetti12]).

## Mixed rules

A mixed rule reads the positions and the edges. Its groups are regions of the board, and they hold many edges. Geography names this problem regionalization: the groups must be contiguous and similar inside. [Bothorel 2015][bothorel15] surveys the clustering of graphs with node attributes.

| Id | Rule | Idea | Objective | Cost | Measures | Nests | Stability | Source |
|---|---|---|---|---|---|---|---|---|
| M1 | Guillotine cut (`cut`) | A k-d tree that puts each line where it crosses the fewest edges. A balance limit stops a cut that leaves a very small part. | `cut(A, B) / min(abs(A), abs(B))` over each line between two sorted centers, on each axis, with `min(abs(A), abs(B)) ≥ β n` | `O(n log n + m)` for each split. `O((n log n + m) · depth)` for the tree. | G2, G8, G4, G5, G6 | native | Medium. Deterministic. Two near-equal lines can change places after a small move. The option `pull` damps this. | [Berger 1987][berger87], [Simon 1991][simon91], [Fiduccia 1982][fiduccia82] |
| M2 | Contiguous agglomerative (`agglomerative`) | Merge only two groups that touch in a graph of neighbours. The distance mixes the positions and the edges. | `(1 - α) · W_pos + α · W_link`, a convex mix of two Ward criteria | `n log n` on a sparse graph of neighbours. `quadratic` with the full order of REDCAP. | G4, G7, G1, G2 | native: the merge tree | Medium. Single linkage chains. Ward and average are stable. | [Assunção 2006][assuncao06], [Guo 2008][guo08], [Chavent 2018][chavent18] |
| M3 | Spatial Leiden (`leiden`) | Leiden on a graph with the edges and a weighted edge for each pair of neighbours on the board. A last step splits each group into its contiguous parts. | `Q` of the mixed graph, or the spatial modularity of [Expert 2011][expert11] | near `linear` in `m + κ n` for `κ` neighbours | G1, G2, G4 | native: one level for each pass | Medium. A seed fixes it. Consensus makes it better. | [Traag 2019][traag19], [Expert 2011][expert11], [Zhou 2009][zhou09] |
| M4 | Keys with a split (`keys`, today) | One group for each key of the host. A large group splits into a quadtree. | The structure that the host knows | `linear`, plus the quadtree | the keys of the host, G6 when `split` is set | native | The highest. A key changes only when the host changes it. | Own (CUSTOM) |

### Notes on the mixed rules

- M1 is the recursive coordinate bisection of [Berger 1987][berger87] with an objective on the edges. In mesh partitioning, [Simon 1991][simon91] found that a spectral split, which reads the edges, cut fewer edges than the coordinate split.
- M1 can scan each line in one pass. Sort the centers on one axis. Each edge adds 1 to the lines between the ranks of its two ends. A prefix sum gives the cut of each line.
- M1 with the balance limit `β = 0.5` is the k-d tree at the median. With a large `pull`, it is the quadtree. Thus the quadtree and S3 are settings of M1.
- M1 keeps clean rectangles. A refinement of [Fiduccia 1982][fiduccia82] can move nodes near the line to the other side, and it cuts fewer edges. Then a part is no longer a rectangle, so the option `band` keeps the moves near the line.
- SKATER ([Assunção 2006][assuncao06]) cuts a minimum spanning tree of the graph of neighbours. REDCAP ([Guo 2008][guo08]) merges along that graph with a linkage, then cuts the merge tree. Both give contiguous groups by their design.
- [Chavent 2018][chavent18] gives the weight `α` and a method to pick it. Raise `α` until the contiguity is high, while the quality on the other data stays near its best.
- [Expert 2011][expert11] removes the effect of the distance from `Q`. That finds groups that the layout does not explain. This library wants the reverse, so M3 adds the proximity edges instead.
- The max-p regions of [Duque 2012][duque12] find the largest number of contiguous regions with a floor on the size of each. A floor on the size is the balance limit of M1.

## Make the groups nest and stay in one region

A rule of the kinds P, L or M can break the rules of the [first table](#what-a-grouping-rule-must-give). These methods repair each rule:

| Method | What it does | For the rules |
|---|---|---|
| Top down | Apply the rule in each group of the level before. A level nests in the level before by its design. | P1, L3, L5, L6, M1 |
| Bottom up | Merge the groups of the level below. A merge tree nests by its design. Cut the tree at `n / r`, `n / r^2` and more items, with the level ratio `r`. | P2, P3 (HDBSCAN), L1, L2, L4, M2, M3 |
| Vote | Make each level alone. Then give each group of a fine level to the group of the coarse level that holds most of its nodes. | Any flat rule. It moves the fewest nodes. |
| Graph of neighbours | Let a merge or a move join only two groups that touch. Use the Delaunay graph of the centers, or the `κ` nearest centers. | P2, L1, L2, M2, M3 |
| Split in parts | Split each group into its connected parts in the graph of neighbours. Each part becomes a group. | Any rule. It can add many small groups. |
| Lines only | Cut only with lines parallel to the axes. The regions are rectangles that do not overlap. | S1, S2, S3, M1 |

- The levels of the tree of sections are its depths. A bottom-up rule has its leaves at different depths. Give the root depth 0, then number the cuts of the merge tree from the top.
- A level item is the bounding box of its nodes. Two groups whose regions are not rectangles can have boxes that overlap, even when the regions do not overlap. Only the lines of S1, S2, S3 and M1 keep G5 to the overhang of the boxes.
- The topological fisheye of [Gansner 2005][gansner05] coarsens a graph for each level of detail. It keeps the geometry and the topology of the graph in each coarse graph. A mixed rule does the same.
- ASK-GraphView ([Abello 2006][abello06]) builds a tree of clusters of the links over a graph with millions of edges. The reader opens the clusters from the top.
- TopoLayout ([Archambault 2007][archambault07]) collapses trees, biconnected parts and dense clusters into one node each, again and again. Each feature then gets its own layout.
- GrouseFlocks ([Archambault 2008][archambault08]) shows several trees of groups on one graph, and the reader picks one. The step `group` and its registry give the same choice.
- [Archambault 2011][archambault11] found that the mental map had little effect on errors and times. The order of the items matters more than an exact position, so Z8 gets a higher weight than Z7.

## Stability under a small change

G9 measures the stability: the adjusted Rand index of [Hubert 1985][hubert85] between the groups before and after one seeded change. The adjusted mutual information of [Vinh 2010][vinh10] gives a second value. It is better when the groups differ in size. [Strehl 2002][strehl02] uses the normalized mutual information to combine many groupings into one.

| Rule | Why it changes | How to make it stable |
|---|---|---|
| S1 quadtree | The root box changes, or a cell crosses `cap`. | Align the root to a fixed grid (the option `anchor`). Split at `cap` and merge at a lower value (hysteresis). |
| S2 grid | Only a node that crosses a cell line | None needed |
| S3 k-d tree | The median moves by one rank. | Use the sliding middle, not the median. |
| S4, S5 packing | One node moves the runs of each later leaf. | Fill leaves to less than `b`, so a change stays in one leaf. |
| P1 k-means | The first centers, and the nodes near a boundary | A fixed seed, and the first centers from the level before |
| P2 single linkage | One node between two groups merges them. | Use Ward or average linkage. |
| L1, L2, L4 | The order of the nodes, and many near-optimal partitions | A fixed seed. Consensus over `runs` seeds ([Lancichinetti 2012][lancichinetti12]). |
| L3 label propagation | Ties break at random. | Consensus, or use L2 |
| L5 spectral | Two eigenvalues near each other | Keep a split only when the eigengap is large ([von Luxburg 2007][luxburg07]). |
| M1 guillotine cut | Two lines with near-equal cuts | The option `pull` prefers the line nearer the middle of the cell. |

[von Luxburg 2010][luxburg10] and [Ben-Hur 2002][benhur02] use the stability to pick the number of groups: a good `k` gives the same groups on many samples. TUNE can use G9 in the same way to pick `cap` or `γ`.

## Against the quadtree: links cut at the far view

The cut share at the far view is G2 at the first level with more than one item. A coarser far view cuts fewer links, so compare two rules only at the same number of items `k`. A rule that leaves one very small group also cuts few links. Thus also report G6.

### Which rules cut fewer links, and why

- **M1, the guillotine cut.** It tests each line, and the midline of the quadtree is near one of them. With the option `guard`, it also tests the quadtree split, so it is not worse at any cell. [Simon 1991][simon91] found that a split that reads the edges cuts fewer edges than a coordinate split. [Karypis 1998][karypis98] cuts fewer edges again, with a multilevel scheme and a refinement of the cut.
- **L2 Leiden and L1 Louvain.** They make `Q` large, and a large `Q` means many edges inside the groups. At the same `k`, they cut fewer edges than any rule of positions. But their groups are not regions, so their far view has boxes that overlap.
- **M3 spatial Leiden and M2 contiguous agglomerative.** They keep the regions and read the edges. They cut more than L2 and fewer than the quadtree, when the host places linked boxes near each other.
- **L6 recursive sparsest cut.** It makes the tree cost small. A low tree cost puts the sparse cuts at the top of the tree ([Dasgupta 2016][dasgupta16]). Its groups are not regions, so M1 is its form for this library: a sparsest cut over lines only.

### A scratch run

A scratch script of this research compared the quadtree against two guillotine rules at the same `k`. The script is not a part of the library. It used one seed of each board, on the case boards and the fixtures with 100 to 1 000 nodes.

- `k-d median`: S3 at the median, on the longer side. It reads no edge.
- `guillotine`: M1 with the ratio cut and `β = 0.25`. Each step splits the largest part, until there are `k` parts.

The cut share at the far view (depth 1, `k = 4`) and at the next level (depth 2). A bold value is the lowest of its row:

| Board | Depth | `k` | Quadtree cut | k-d median cut | Guillotine cut | Quadtree G6 | Guillotine G6 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `case-dense-groups` | 1 | 4 | 0.430 | 0.487 | **0.370** | 0.98 | 0.95 |
| `case-dense-groups` | 2 | 15 | 0.683 | 0.737 | **0.660** | 0.92 | 0.98 |
| `case-hub-chain` | 1 | 4 | 0.210 | 0.269 | **0.202** | 0.96 | 0.95 |
| `case-hub-chain` | 2 | 12 | 0.294 | 0.496 | 0.294 | 1.00 | 0.99 |
| `case-many-groups` | 1 | 4 | 0.390 | 0.390 | **0.316** | 1.00 | 0.95 |
| `case-many-groups` | 2 | 16 | 0.471 | 0.465 | **0.444** | 1.00 | 0.99 |
| `nestedGridBoard` | 1 | 4 | 0.296 | 0.296 | **0.247** | 1.00 | 0.97 |
| `nestedGridBoard` | 2 | 16 | 0.550 | 0.550 | **0.474** | 1.00 | 0.98 |
| `small-clustered` | 1 | 4 | 0.430 | 0.430 | **0.415** | 0.94 | 1.00 |
| `small-clustered` | 2 | 14 | 0.710 | 0.765 | **0.625** | 0.91 | 0.98 |
| `grid-400` | 1 | 4 | 0.351 | 0.351 | 0.351 | 1.00 | 1.00 |
| `grid-400` | 2 | 16 | 0.551 | 0.551 | **0.519** | 1.00 | 0.99 |
| `mid-uniform` | 1 | 4 | 0.319 | 0.321 | **0.313** | 1.00 | 1.00 |
| `mid-uniform` | 2 | 16 | 0.484 | 0.489 | **0.452** | 1.00 | 1.00 |
| `mid-clustered` | 1 | 4 | **0.332** | 0.343 | 0.340 | 0.97 | 1.00 |
| `mid-clustered` | 2 | 15 | **0.482** | 0.534 | 0.500 | 0.89 | 0.99 |
| `mid-hubs` | 1 | 4 | 0.317 | 0.325 | **0.315** | 1.00 | 1.00 |
| `mid-hubs` | 2 | 16 | 0.481 | 0.483 | **0.449** | 1.00 | 1.00 |
| `mid-fanout` | 1 | 4 | 0.625 | 0.618 | **0.583** | 1.00 | 1.00 |
| `mid-fanout` | 2 | 16 | **0.747** | 0.782 | 0.759 | 0.89 | 1.00 |

What the run shows:

- At the far view, the guillotine cut is lower on 8 of 10 boards, the same on 1, and higher on 1. On `case-many-groups`, it cuts 19% fewer links (0.316, not 0.390). On `nestedGridBoard`, it cuts 17% fewer, and on `case-dense-groups` 14% fewer.
- Over both levels, the guillotine cut is lower on 15 of 20 rows, the same on 2 and higher on 3.
- The k-d median is worse than the quadtree on 12 of 20 rows, and better on 2. Thus the gain comes from the edges, not from a line that moves.
- The guillotine cut loses on `mid-clustered`, and on `mid-fanout` at depth 2. There, the quadtree has less balance (G6 of 0.89), and the greedy order of the splits cannot match it. GRP2 adds the quadtree split as one more candidate at each cell, and keeps the split with the lower cut. Then the rule is not worse than the quadtree at any cell, at the same balance.
- A balance limit of 0.1 gives a lower cut on `case-many-groups` (0.294), with G6 of 0.89. A limit of 0.4 loses on `case-hub-chain` (0.269). Thus `β` is the first option for TUNE.
- MEAS1 repeats this run with seeds and medians in the bench. The run has no times, because times on a shared machine are not reliable.

## The build order for GRP2

Each rule is a strategy of the step `group`, with its folder, its tests, its `schema` and a row of `groupSettings` in the benchmark. Each rule passes `checkSections` and the proposed rule `level-nesting` on each fixture. The order puts a low cost and a clear gain first.

| Order | Rule | Why at this place |
|---|---|---|
| 1 | `kd` (S3) | The base of `cut`. Cheap, nested and with no overlap. It also gives an exact `k` and a balance of 1. |
| 2 | `cut` (M1) | The rule that cuts fewer links than the quadtree, with rectangles. The scratch run shows the gain. |
| 3 | `agglomerative` (P2, M2) | The first rule that follows the shapes of the host layout. With `alpha` above 0, it also reads the edges. |
| 4 | `leiden` (L2, M3) | The rule with the fewest cut links, for a host that accepts groups of any shape. With `spatial` above 0, the groups are regions. |
| 5 | `pack` (S4, S5) | The fastest rule with full groups, for boards of 100 000 nodes. |

### The options of each rule

| Rule | Option | Type | Range | Default | Effect |
|---|---|---|---|---|---|
| `kd` | `cap` | integer | 1 to 32 | 8 | A cell with more nodes splits. The same as the quadtree. |
| `kd` | `maxDepth` | integer | 1 to 32 | 16 | The depth limit of the tree |
| `kd` | `line` | `median`, `middle`, `slide` | 3 values | `slide` | The place of the line in the cell |
| `kd` | `fanout` | 2 or 4 | 2 values | 4 | The number of children of a section. With 4, a section splits two times on one level. |
| `kd` | `axis` | `longer`, `alternate` | 2 values | `longer` | The axis of each split |
| `cut` | `cap`, `maxDepth`, `fanout` | as `kd` | as `kd` | as `kd` | The limits of the tree |
| `cut` | `balance` (`β`) | number | 0.05 to 0.5 | 0.25 | The smallest share of the nodes in each part of a split |
| `cut` | `objective` | `ratio`, `normalized`, `sparsest` | 3 values | `ratio` | The cost of a line: `cut / min(abs(A), abs(B))`, the normalized cut or `cut / (abs(A) · abs(B))` |
| `cut` | `pull` | number | 0 to 4 | 0.5 | The cost of a line also grows by `pull` times its distance from the middle, as a share of the cell. |
| `cut` | `guard` | boolean | 2 values | `true` | It also tests the quadtree split, and keeps the split with the lower cut. |
| `cut` | `refine` | integer | 0 to 8 | 0 | The number of passes of the move step of Fiduccia and Mattheyses. With 0, the parts stay rectangles. |
| `cut` | `band` | number | 0 to 4 | 1 | A move of `refine` stays within this many units `u` of the line. |
| `agglomerative` | `linkage` | `ward`, `average`, `single`, `complete` | 4 values | `ward` | The distance between two groups |
| `agglomerative` | `alpha` (`α`) | number | 0 to 1 | 0 | The weight of the edges in the distance. With 0, it reads the positions only. |
| `agglomerative` | `neighbours` | `delaunay`, or an integer `κ` from 4 to 16 | 2 kinds | `delaunay` | The graph of neighbours. Only two groups that touch in it merge. |
| `agglomerative` | `ratio` (`r`) | number | 2 to 8 | 4 | The level ratio: each level has `r` times fewer items than the level below. |
| `leiden` | `resolution` (`γ`) | number, log scale | 0.1 to 4 | 1 | A larger value gives smaller groups. |
| `leiden` | `spatial` | number | 0 to 1 | 0.3 | The weight of the proximity edges against the edges of the graph |
| `leiden` | `neighbours` | as `agglomerative` | as `agglomerative` | 8 | The graph of the proximity edges |
| `leiden` | `contiguous` | boolean | 2 values | `true` | Split each group into its contiguous parts. |
| `leiden` | `seed` | integer | any | 1 | The seed of the order of the nodes |
| `leiden` | `runs` | integer | 1 to 20 | 1 | With more than 1, a consensus over this many seeds |
| `pack` | `order` | `str`, `hilbert` | 2 values | `str` | The sort of the nodes |
| `pack` | `leaf` (`b`) | integer | 4 to 64 | 8 | The nodes of each leaf |
| `pack` | `fanout` | integer | 2 to 16 | 4 | The children of each section above the leaves |
| `pack` | `fill` | number | 0.5 to 1 | 1 | The share of `b` that each leaf holds. A lower fill makes a change stay in one leaf. |

### The measure targets

| Rule | Hard rules | Make better | Keep near the quadtree |
|---|---|---|---|
| `kd` | `checkSections`, `level-nesting`, `counts-sum`, `link-ends` | G6, G4 | G2, Z5, G9 |
| `cut` | as `kd` | G2 at the far view, G8, G1 | G4, G5, G6, Z5 |
| `agglomerative` | as `kd` | G7, G4, and G1 with `alpha` above 0 | G5, Z5, G9 |
| `leiden` | as `kd` | G1, G2, G3 | G4, G5, G9 with `runs` above 1 |
| `pack` | as `kd` | time, G6 | G4, G5 |

### How TUNE sweeps them

- TUNE reads the options of each rule from its `schema`, as for the other steps. It sweeps each number on its range, with a log scale where the `schema` says `scale: "log"`.
- It starts `sweepSections` with `groupSettings(strategies, options)` on each fixture family, with 20 seeds, as the method of [MEAS0](MEASURES.md#method) tells.
- It compares the rules at the same number of items at each level. Each rule gets the setting that gives the `farItems` of the quadtree, or the budget `B` of Z4.
- It removes each setting with a violation of a hard rule. Then it gives the Pareto front of G2 at the far view, G4 and G9. G6 and Z5 are the next axes.
- For `cut`, the first sweep is `balance` against `pull`. A large `pull` gives the quadtree, so the front shows the gain of each step away from it.
- For `leiden`, the first sweep is `resolution` against `spatial`. For `agglomerative`, it is `alpha` against `linkage`.
- The measures G1, G2 and G8 are `linear`. G9 needs an extra run for each change, so TUNE measures it only on the front.

## Sources

- <a id="abello06"></a>Abello, van Ham and Krishnan, 2006. [ASK-GraphView: a large scale graph visualization system](https://doi.org/10.1109/TVCG.2006.120). IEEE TVCG 12(5).
- <a id="archambault07"></a>Archambault, Munzner and Auber, 2007. [TopoLayout: multilevel graph layout by topological features](https://www.cs.ubc.ca/labs/imager/tr/2006/Archambault_TopoLayout_TVCG/). IEEE TVCG 13(2).
- <a id="archambault08"></a>Archambault, Munzner and Auber, 2008. [GrouseFlocks: steerable exploration of graph hierarchy space](https://www.cs.ubc.ca/labs/imager/tr/2008/Archambault_GrouseFlocks_TVCG). IEEE TVCG 14(4).
- <a id="archambault11"></a>Archambault, Purchase and Pinaud, 2011. [Animation, small multiples, and the effect of mental map preservation in dynamic graphs](https://doi.org/10.1109/TVCG.2010.78). IEEE TVCG 17(4).
- <a id="arthur07"></a>Arthur and Vassilvitskii, 2007. [k-means++: the advantages of careful seeding](https://dl.acm.org/doi/10.5555/1283383.1283494). SODA 2007.
- <a id="assuncao06"></a>Assunção, Neves, Câmara and Freitas, 2006. [Efficient regionalization techniques for socio-economic geographical units using minimum spanning trees](https://doi.org/10.1080/13658810600665111). IJGIS 20(7). This paper gives SKATER.
- <a id="bederson02"></a>Bederson, Shneiderman and Wattenberg, 2002. [`Ordered and quantum treemaps: making effective use of 2D space to display hierarchies`](https://doi.org/10.1145/571647.571649). ACM TOG 21(4).
- <a id="benhur02"></a>Ben-Hur, Elisseeff and Guyon, 2002. [A stability based method for discovering structure in clustered data](https://psb.stanford.edu/psb-online/proceedings/psb02/benhur.pdf). PSB 2002.
- <a id="bentley75"></a>Bentley, 1975. [Multidimensional binary search trees used for associative searching](https://doi.org/10.1145/361002.361007). CACM 18(9).
- <a id="berger87"></a>Berger and Bokhari, 1987. [A partitioning strategy for nonuniform problems on multiprocessors](https://doi.org/10.1109/TC.1987.1676942). IEEE Trans. Computers 36(5).
- <a id="blondel08"></a>Blondel, Guillaume, Lambiotte and Lefebvre, 2008. [Fast unfolding of communities in large networks](https://arxiv.org/abs/0803.0476). J. Stat. Mech. P10008.
- <a id="bothorel15"></a>Bothorel, Cruz, Magnani and Micenková, 2015. [Clustering attributed graphs: models, measures and methods](https://arxiv.org/abs/1501.01676). Network Science 3(3).
- <a id="campello13"></a>Campello, Moulavi and Sander, 2013. [Density-based clustering based on hierarchical density estimates](https://doi.org/10.1007/978-3-642-37456-2_14). PAKDD 2013. This paper gives HDBSCAN.
- <a id="charikar17"></a>Charikar and Chatziafratis, 2017. [`Approximate hierarchical clustering via sparsest cut and spreading metrics`](https://arxiv.org/abs/1609.09548). SODA 2017.
- <a id="chavent18"></a>Chavent, Kuentz-Simonet, Labenne and Saracco, 2018. [ClustGeo: an R package for hierarchical clustering with spatial constraints](https://arxiv.org/abs/1707.03897). Computational Statistics 33.
- <a id="cohenaddad19"></a>Cohen-Addad, Kanade, Mallmann-Trenn and Mathieu, 2019. [Hierarchical clustering: objective functions and algorithms](https://arxiv.org/abs/1704.02147). JACM 66(4).
- <a id="comaniciu02"></a>Comaniciu and Meer, 2002. [Mean shift: a robust approach toward feature space analysis](https://doi.org/10.1109/34.1000236). IEEE TPAMI 24(5).
- <a id="dasgupta16"></a>Dasgupta, 2016. [A cost function for similarity-based hierarchical clustering](https://arxiv.org/abs/1510.05043). STOC 2016.
- <a id="duque12"></a>Duque, Anselin and Rey, 2012. [The max-p-regions problem](https://doi.org/10.1111/j.1467-9787.2011.00743.x). Journal of Regional Science 52(3).
- <a id="eades96"></a>Eades and Feng, 1996. [Multilevel visualization of clustered graphs](https://doi.org/10.1007/3-540-62495-3_42). GD 1996.
- <a id="elmqvist10"></a>Elmqvist and Fekete, 2010. [Hierarchical aggregation for information visualization](https://hal.science/hal-00696751). IEEE TVCG 16(3).
- <a id="ester96"></a>Ester, Kriegel, Sander and Xu, 1996. [A density-based algorithm for discovering clusters in large spatial databases with noise](https://cdn.aaai.org/KDD/1996/KDD96-037.pdf). KDD 1996. This paper gives DBSCAN.
- <a id="expert11"></a>Expert, Evans, Blondel and Lambiotte, 2011. [Uncovering space-independent communities in spatial networks](https://doi.org/10.1073/pnas.1018962108). PNAS 108(19).
- <a id="fiduccia82"></a>Fiduccia and Mattheyses, 1982. [A linear-time heuristic for improving network partitions](https://doi.org/10.1145/800263.809204). DAC 1982.
- <a id="finkel74"></a>Finkel and Bentley, 1974. [Quad trees: a data structure for retrieval on composite keys](https://doi.org/10.1007/BF00288933). Acta Informatica 4.
- <a id="fortunato07"></a>Fortunato and Barthélemy, 2007. [Resolution limit in community detection](https://arxiv.org/abs/physics/0607100). PNAS 104(1).
- <a id="fortunato10"></a>Fortunato, 2010. [Community detection in graphs](https://arxiv.org/abs/0906.0612). Physics Reports 486.
- <a id="gansner05"></a>Gansner, Koren and North, 2005. [Topological fisheye views for visualizing large graphs](https://graphviz.org/documentation/GKN04a.pdf). IEEE TVCG 11(4).
- <a id="good10"></a>Good, de Montjoye and Clauset, 2010. [The performance of modularity maximization in practical contexts](https://arxiv.org/abs/0910.0165). Physical Review E 81.
- <a id="guo08"></a>Guo, 2008. [Regionalization with dynamically constrained agglomerative clustering and partitioning (REDCAP)](https://doi.org/10.1080/13658810701674970). IJGIS 22(7).
- <a id="guttman84"></a>Guttman, 1984. [R-trees: a dynamic index structure for spatial searching](https://doi.org/10.1145/602259.602266). SIGMOD 1984.
- <a id="hubert85"></a>Hubert and Arabie, 1985. [Comparing partitions](https://doi.org/10.1007/BF01908075). Journal of Classification 2.
- <a id="kamel94"></a>Kamel and Faloutsos, 1994. [Hilbert R-tree: an improved R-tree using fractals](https://www.vldb.org/conf/1994/P500.PDF). VLDB 1994.
- <a id="karypis98"></a>Karypis and Kumar, 1998. [A fast and high quality multilevel scheme for partitioning irregular graphs](https://doi.org/10.1137/S1064827595287997). SIAM J. Sci. Comput. 20(1). This paper gives METIS.
- <a id="lancichinetti12"></a>Lancichinetti and Fortunato, 2012. [Consensus clustering in complex networks](https://arxiv.org/abs/1203.6093). Scientific Reports 2.
- <a id="leutenegger97"></a>Leutenegger, Lopez and Edgington, 1997. [`STR: a simple and efficient algorithm for R-tree packing`](https://ieeexplore.ieee.org/document/582015). ICDE 1997.
- <a id="luxburg07"></a>von Luxburg, 2007. [A tutorial on spectral clustering](https://arxiv.org/abs/0711.0189). Statistics and Computing 17(4).
- <a id="luxburg10"></a>von Luxburg, 2010. [Clustering stability: an overview](https://arxiv.org/abs/1007.1075). `Foundations and Trends in Machine Learning` 2(3).
- <a id="maneewongvatana99"></a>Maneewongvatana and Mount, 1999. [Analysis of approximate nearest neighbor searching with clustered point sets](https://arxiv.org/abs/cs/9901013). DIMACS 1999. This paper gives the sliding middle.
- <a id="misue95"></a>Misue, Eades, Lai and Sugiyama, 1995. [Layout adjustment and the mental map](https://doi.org/10.1006/jvlc.1995.1010). JVLC 6(2).
- <a id="moseley23"></a>Moseley and Wang, 2023. [Approximation bounds for hierarchical clustering: average linkage, bisecting k-means, and local search](https://jmlr.org/papers/v24/18-080.html). JMLR 24. The first version is in NeurIPS 2017.
- <a id="mullner11"></a>Müllner, 2011. [Modern hierarchical, agglomerative clustering algorithms](https://arxiv.org/abs/1109.2378).
- <a id="murtagh12"></a>Murtagh and Contreras, 2012. [Algorithms for hierarchical clustering: an overview](https://arxiv.org/abs/1105.0121). WIREs Data Mining and Knowledge Discovery 2(1).
- <a id="raghavan07"></a>Raghavan, Albert and Kumara, 2007. [Near linear time algorithm to detect community structures in large-scale networks](https://arxiv.org/abs/0709.2938). Physical Review E 76.
- <a id="reichardt06"></a>Reichardt and Bornholdt, 2006. [Statistical mechanics of community detection](https://arxiv.org/abs/cond-mat/0603718). Physical Review E 74.
- <a id="rosvall08"></a>Rosvall and Bergstrom, 2008. [Maps of random walks on complex networks reveal community structure](https://arxiv.org/abs/0707.0609). PNAS 105(4).
- <a id="rosvall11"></a>Rosvall and Bergstrom, 2011. [Multilevel compression of random walks on networks reveals hierarchical organization in large integrated systems](https://doi.org/10.1371/journal.pone.0018209). PLoS ONE 6(4).
- <a id="samet06"></a>Samet, 2006. [Foundations of multidimensional and metric data structures](https://shop.elsevier.com/books/foundations-of-multidimensional-and-metric-data-structures/samet/978-0-12-369446-1). Morgan Kaufmann.
- <a id="schubert19"></a>Schubert and Rousseeuw, 2019. [`Faster k-medoids clustering: improving the PAM, CLARA, and CLARANS algorithms`](https://arxiv.org/abs/1810.05691). SISAP 2019.
- <a id="shi00"></a>Shi and Malik, 2000. [Normalized cuts and image segmentation](https://doi.org/10.1109/34.868688). IEEE TPAMI 22(8).
- <a id="simon91"></a>Simon, 1991. [Partitioning of unstructured problems for parallel processing](https://www.academia.edu/628034/Partitioning_of_unstructured_problems_for_parallel_processing). `Computing Systems in Engineering` 2(2/3).
- <a id="strehl02"></a>Strehl and Ghosh, 2002. [Cluster ensembles: a knowledge reuse framework for combining multiple partitions](https://www.jmlr.org/papers/v3/strehl02a.html). JMLR 3.
- <a id="traag19"></a>Traag, Waltman and van Eck, 2019. [From Louvain to Leiden: guaranteeing well-connected communities](https://arxiv.org/abs/1810.08473). Scientific Reports 9.
- <a id="vinh10"></a>Vinh, Epps and Bailey, 2010. [Information theoretic measures for clusterings comparison](https://jmlr.org/papers/v11/vinh10a.html). JMLR 11.
- <a id="ward63"></a>Ward, 1963. [Hierarchical grouping to optimize an objective function](https://doi.org/10.1080/01621459.1963.10500845). JASA 58(301).
- <a id="zhou09"></a>Zhou, Cheng and Yu, 2009. [Graph clustering based on structural/attribute similarities](https://www.vldb.org/pvldb/vol2/vldb09-175.pdf). VLDB 2009. This paper gives SA-Cluster.

[abello06]: #abello06
[archambault07]: #archambault07
[archambault08]: #archambault08
[archambault11]: #archambault11
[arthur07]: #arthur07
[assuncao06]: #assuncao06
[bederson02]: #bederson02
[benhur02]: #benhur02
[bentley75]: #bentley75
[berger87]: #berger87
[blondel08]: #blondel08
[bothorel15]: #bothorel15
[campello13]: #campello13
[charikar17]: #charikar17
[chavent18]: #chavent18
[cohenaddad19]: #cohenaddad19
[comaniciu02]: #comaniciu02
[dasgupta16]: #dasgupta16
[duque12]: #duque12
[eades96]: #eades96
[elmqvist10]: #elmqvist10
[ester96]: #ester96
[expert11]: #expert11
[fiduccia82]: #fiduccia82
[finkel74]: #finkel74
[fortunato07]: #fortunato07
[fortunato10]: #fortunato10
[gansner05]: #gansner05
[good10]: #good10
[guo08]: #guo08
[guttman84]: #guttman84
[hubert85]: #hubert85
[kamel94]: #kamel94
[karypis98]: #karypis98
[lancichinetti12]: #lancichinetti12
[leutenegger97]: #leutenegger97
[luxburg07]: #luxburg07
[luxburg10]: #luxburg10
[maneewongvatana99]: #maneewongvatana99
[misue95]: #misue95
[moseley23]: #moseley23
[mullner11]: #mullner11
[murtagh12]: #murtagh12
[raghavan07]: #raghavan07
[reichardt06]: #reichardt06
[rosvall08]: #rosvall08
[rosvall11]: #rosvall11
[samet06]: #samet06
[schubert19]: #schubert19
[shi00]: #shi00
[simon91]: #simon91
[strehl02]: #strehl02
[traag19]: #traag19
[vinh10]: #vinh10
[ward63]: #ward63
[zhou09]: #zhou09
