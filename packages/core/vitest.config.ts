import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.test.ts"],
    // A script that a test starts writes no line to the step summary of the CI job, because the made-up data of a test is not a read (NO-READ-LINE).
    env: { GITHUB_STEP_SUMMARY: "" },
  },
});
