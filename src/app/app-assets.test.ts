import { describe, expect, it } from "vitest";
import logoSvg from "../assets/velo-logo.svg?raw";
import indexHtml from "../../index.html?raw";
import tauriConfigSource from "../../src-tauri/tauri.conf.json?raw";

describe("应用图片资源", () => {
  it("使用统一的应用图标作为前端 logo 与 favicon", () => {
    expect(indexHtml).toContain('href="/app-icon.svg"');
    expect(logoSvg).toContain('viewBox="0 0 1024 1024"');
    expect(logoSvg).toContain("filmGradient");
    expect(logoSvg).toContain("playGradient");
  });

  it("Tauri 配置继续指向已生成的应用图标文件", () => {
    const config = JSON.parse(tauriConfigSource) as {
      bundle: { icon: string[] };
    };

    expect(config.bundle.icon).toEqual([
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico",
    ]);
  });
});
