# Changelog of `@mark1russell7/highways`

## 0.14.0

This version is a MINOR before 1.0, because default routes change and callers hash them.

### Routes that change

- The corner graph joins its parts when closed regions split it (CORNER-REACH). A route on such a board can change. Each other board keeps its bytes.
- Larger boards change more. Boards of `maze` that change go from 4 percent at the default size to 39 percent at the largest size.
- A route with no way says so in its record, with the field `through`. This field also applies to the router `seams`.

### Cost

- On 29 of 48 boards, the join does its work and gains no link. On those boards, the median added time is 0.20 ms.

### A limit

- At `levelJoinWork` 0, a level link of walled items can go through a wall box, and no link is lost.
- A level link can go through a box on the real router, with or without the join. The item LEVEL-CROSSINGS measures it.
- The record `scripts/data/level-join/crossings.json` gives the counts. On `maze` at its largest size, 142 of 329 links cross a box.

### New

- The option `rangeShrink` of `assign` (ASSIGN-BOUND).
- The opt-in router `seams` (PASS-SEAMS).
- The set `screen-v4`, the absolute count of pass-throughs and the signal `route.no-graph` (PASS-GRID).
- The input families `channel`, `comb`, `spiral`, `switchbox`, `escape` and `rings` (FAMILIES-WEEKLY).
