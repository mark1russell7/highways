// The core knows no renderer (CORE-IMPORT-GATE). The rule core-knows-no-renderer of `.dependency-cruiser.ts` holds the imports.
// This test holds the types: the config of the core gives no DOM library, so the source cannot name a type of a browser.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const folder = fileURLToPath(new URL("../", import.meta.url));
// The package typescript exports no path to its bin, so the test finds the bin next to its package.json.
const tsc = join(dirname(createRequire(import.meta.url).resolve("typescript/package.json")), "bin", "tsc");

interface ShownConfig {
  readonly compilerOptions: { readonly lib?: readonly string[]; readonly types?: readonly string[] };
}

describe("the config of the core (CORE-IMPORT-GATE)", () => {
  for (const file of ["tsconfig.json", "tsconfig.test.json"]) {
    it(`gives no DOM library in ${file}`, () => {
      const text = execFileSync(process.execPath, [tsc, "-p", file, "--showConfig"], { cwd: folder, encoding: "utf8" });
      const { compilerOptions } = JSON.parse(text) as ShownConfig;
      // With no lib, TypeScript takes the default libraries of the target, and they hold the DOM. So the config names its libraries.
      expect(compilerOptions.lib, "lib").toBeDefined();
      expect(compilerOptions.lib, "lib").not.toContainEqual(expect.stringMatching(/^dom/i));
      expect(compilerOptions.types ?? [], "types").not.toContainEqual(expect.stringMatching(/dom|browser/i));
    });
  }
});
