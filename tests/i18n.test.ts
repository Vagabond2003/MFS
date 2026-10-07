import { describe, expect, it } from "vitest";
import { i18nCoverage } from "../scripts/lib/i18n-coverage.mjs";

describe("Bengali translations", () => {
  it("every translatable English string has a Bengali entry", () => {
    const { found, missing } = i18nCoverage() as { found: Map<string, string>; missing: [string, string][] };
    expect(found.size).toBeGreaterThan(0);
    // On failure: each missing string with the file:line it first appears at. Add it to src/lib/i18n/dict/bn-*.ts.
    expect(missing.map(([key, where]) => `${where}  ${JSON.stringify(key)}`)).toEqual([]);
  });
});
