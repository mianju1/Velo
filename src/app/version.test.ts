import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import { APP_VERSION, DISPLAY_APP_VERSION } from "./version";

describe("app version", () => {
  it("uses package.json as the source for the displayed version", () => {
    expect(APP_VERSION).toBe(packageJson.version);
    expect(DISPLAY_APP_VERSION).toBe(`v${packageJson.version}`);
  });
});
