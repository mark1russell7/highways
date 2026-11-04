import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALL_PATHS, gatePaths, importClosure, importsOf, opaqueImports } from "./scope.ts";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");

describe("the imports of a source text", () => {
  it("reads each form of an import, and leaves out each type import", () => {
    const source = [
      'import a from "./a.ts";',
      'import {\n  b,\n  c,\n} from "./b.ts";',
      'import "./c.ts";',
      'export { d } from "./d.ts";',
      'export * from "./e.ts";',
      'import type { F } from "./f.ts";',
      'export type { G } from "./g.ts";',
      'export const h = "./h.ts";',
      'const i = await import("./i.ts");',
    ].join("\n");
    expect(importsOf(source).sort()).toEqual(["./a.ts", "./b.ts", "./c.ts", "./d.ts", "./e.ts", "./i.ts"]);
  });
});

describe("the forms of import that the walk cannot read", () => {
  it("counts each unknown form, and no known form", () => {
    expect(opaqueImports('import a from "./a.ts";\nimport type { B } from "./b.ts";\nconst c = await import("./c.ts");\nconst d = import.meta.url;\n')).toBe(0);
    expect(opaqueImports("// The gate calls `import()` in its job.\n/** Use `require(x)`. */\n")).toBe(0);
    expect(opaqueImports("import a from './a.ts';\n")).toBe(1);
    expect(opaqueImports("const a = await import(name);\n")).toBe(1);
    expect(opaqueImports('const a = require("./a.ts");\n')).toBe(1);
    expect(opaqueImports('const a = new Worker("./a.ts");\n')).toBe(1);
  });
});

describe("the walk of the imports", () => {
  it("throws an error for a target that does not exist, and for an unknown form", () => {
    const root = mkdtempSync(join(tmpdir(), "scope-"));
    writeFileSync(join(root, "a.ts"), 'import "./gone.ts";\n');
    writeFileSync(join(root, "b.ts"), "const c = await import(name);\n");
    expect(() => importClosure(root, ["a.ts"])).toThrow(/no file/);
    expect(() => importClosure(root, ["b.ts"])).toThrow(/cannot read/);
    expect(importClosure(root, ["b.ts"], { "b.ts": 1 }).files).toEqual(["b.ts"]);
  });

  it("reaches each file of a chain and each package, and ends on a cycle", () => {
    const root = mkdtempSync(join(tmpdir(), "scope-"));
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "a.ts"), 'import "./sub/b.ts";\nimport "node:fs";\n');
    writeFileSync(join(root, "sub", "b.ts"), 'import "../a.ts";\nimport "some-package";\n');
    writeFileSync(join(root, "other.ts"), "");
    expect(importClosure(root, ["a.ts"])).toEqual({ files: ["a.ts", "sub/b.ts"], packages: ["some-package"] });
  });
});

describe("the paths of the sections gate", () => {
  const paths = gatePaths(ROOT);

  it("gives the pattern of each file when the walk fails, so the gate runs", () => {
    expect(gatePaths(mkdtempSync(join(tmpdir(), "scope-")))).toEqual([ALL_PATHS]);
  });

  it("holds the measured router and the code below it, and each file of the gate", () => {
    for (const path of ["packages/core/src/routers/sections.ts", "packages/core/src/visibility.ts", "packages/core/src/strategies/builtins.ts", "packages/core/scripts/gates/pair-confirm.ts", "packages/core/scripts/gates/home-verdict.ts", ".github/workflows/sections-gate.yml", "pnpm-lock.yaml"]) expect(paths).toContain(path);
  });

  it("leaves out a router that the measured route does not call", () => {
    for (const path of ["packages/core/src/routers/rules/solver.ts", "packages/core/src/routers/repel/index.ts"]) expect(paths).not.toContain(path);
  });

  it("gives only paths that exist, or a pattern of the data of the gate", () => {
    for (const path of paths.filter((p) => !p.includes("*"))) expect(() => readFileSync(join(ROOT, path))).not.toThrow();
  });

  it("is what the workflow reads, with no hand list", () => {
    const workflow = readFileSync(join(ROOT, ".github/workflows/sections-gate.yml"), "utf8");
    expect(workflow).toContain("node packages/core/scripts/gates/scope.ts || echo '**'");
    expect(workflow).toContain("paths: ${{ steps.scope.outputs.paths }}");
    expect(workflow).not.toContain("packages/core/src/**");
  });
});
