import { describe, expect, it } from "vitest";
import { normalizeFontFamilies } from "./fonts";

describe("system fonts service", () => {
  it("trims, sorts, and de-duplicates font family names case-insensitively", () => {
    expect(normalizeFontFamilies([" Segoe UI ", "", "Arial", "segoe ui", "MapleMono-CN"])).toEqual([
      "Arial",
      "MapleMono-CN",
      "Segoe UI",
    ]);
  });
});
