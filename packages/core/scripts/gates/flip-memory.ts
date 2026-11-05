// The fault of the flip test of the heap gate. `NODE_OPTIONS=--import=<this file>` loads it before the script of a process.
// The process fills `FLIP_ALLOCATE_MB` MB and holds them until it stops, so its peak RSS rises by that size.
const size = Number(process.env["FLIP_ALLOCATE_MB"]);
if (!Number.isFinite(size) || size <= 0) throw new Error(`The fault needs a size in FLIP_ALLOCATE_MB, not "${process.env["FLIP_ALLOCATE_MB"]}".`);
(globalThis as { flipHeld?: Buffer }).flipHeld = Buffer.alloc(size * 2 ** 20, 1);
