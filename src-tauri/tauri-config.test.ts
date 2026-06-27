import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

type TauriConfig = {
  version?: string | null;
  app?: {
    macOSPrivateApi?: boolean;
    windows?: Array<{
      transparent?: boolean;
    }>;
  };
};

describe("tauri macOS 视频渲染配置", () => {
  test("主窗口允许 WebView 透明以露出底层 OpenGL 视频视图", () => {
    const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")) as TauriConfig;
    const cargoToml = readFileSync("src-tauri/Cargo.toml", "utf8");

    expect(config.app?.macOSPrivateApi).toBe(true);
    expect(config.app?.windows?.[0]?.transparent).toBe(true);
    expect(cargoToml).toContain('features = ["macos-private-api"]');
  });

  test("应用版本以根 package.json 为单一来源并校验 Cargo 版本同步", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")) as TauriConfig;
    const cargoToml = readFileSync("src-tauri/Cargo.toml", "utf8");

    const cargoVersion = cargoToml.match(/^version = "([^"]+)"$/m)?.[1];

    expect(config.version).toBe("../package.json");
    expect(cargoVersion).toBe(packageJson.version);
  });
});
