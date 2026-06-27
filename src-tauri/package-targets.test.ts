import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

type PackageJson = {
  scripts?: Record<string, string>;
};

type TauriConfig = {
  bundle?: {
    targets?: string[];
  };
};

type WindowsTauriConfig = {
  bundle?: {
    resources?: Record<string, string>;
  };
};

describe("跨平台打包入口", () => {
  test("npm scripts 分别提供 macOS、Windows 和双平台打包命令", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;

    expect(packageJson.scripts?.["tauri:build:macos"]).toBe("tauri build --bundles app");
    expect(packageJson.scripts?.["tauri:build:windows"]).toBe(
      "CARGO_HTTP_MULTIPLEXING=false tauri build --target x86_64-pc-windows-gnu --bundles nsis",
    );
    expect(packageJson.scripts?.["prepare:windows-mpv"]).toBe(
      "./scripts/prepare-windows-mpv-runtime.sh",
    );
    expect(packageJson.scripts?.["prepare:libmpv:sonoma"]).toBe(
      "./scripts/prepare-macos-sonoma-libmpv-runtime.sh",
    );
    expect(packageJson.scripts?.["sign:macos"]).toBe("./scripts/sign-macos-app.sh");
    expect(packageJson.scripts?.["verify:macos-runtime"]).toBe(
      "./scripts/verify-macos-libmpv-runtime.sh",
    );
    expect(packageJson.scripts?.["dmg:macos"]).toBe("./scripts/create-macos-dmg.sh");
    expect(packageJson.scripts?.["notarize:macos"]).toBe("./scripts/notarize-macos-dmg.sh");
    const macosBuildPipeline =
      "npm run prepare:libmpv:sonoma && npm run tauri:build:macos && npm run verify:macos-runtime && npm run sign:macos && npm run dmg:macos";
    expect(packageJson.scripts?.["package:macos:unsigned"]).toBe(
      "npm run prepare:libmpv:sonoma && npm run tauri:build:macos && npm run verify:macos-runtime && npm run dmg:macos",
    );
    expect(packageJson.scripts?.["package:macos:local"]).toBe(macosBuildPipeline);
    expect(packageJson.scripts?.["package:macos:release"]).toBe(
      `${macosBuildPipeline} && MACOS_NOTARIZE_REQUIRED=1 MACOS_NOTARIZE=1 npm run notarize:macos`,
    );
    expect(packageJson.scripts?.["package:macos"]).toBe("npm run package:macos:release");
    expect(packageJson.scripts?.["package:windows"]).toBe(
      "npm run prepare:windows-mpv && npm run tauri:build:windows",
    );
    expect(packageJson.scripts?.["package:all"]).toBe(
      "npm run package:macos:release && npm run package:windows",
    );
  });

  test("默认 Tauri bundle 只生成 macOS app 和 dmg", () => {
    const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")) as TauriConfig;

    expect(config.bundle?.targets).toEqual(["app", "dmg"]);
  });

  test("Windows bundle 会包含 mpv runtime 资源目录", () => {
    const config = JSON.parse(
      readFileSync("src-tauri/tauri.windows.conf.json", "utf8"),
    ) as WindowsTauriConfig;

    expect(config.bundle?.resources).toEqual({
      "./runtime/windows/bin": "bin",
    });
  });

  test("macOS 包含可分发内嵌 libmpv 的 CI 构建和验收脚本", () => {
    const verifyScript = readFileSync("scripts/verify-macos-libmpv-runtime.sh", "utf8");
    const prepareScript = readFileSync("scripts/prepare-macos-sonoma-libmpv-runtime.sh", "utf8");
    const viteConfig = readFileSync("vite.config.ts", "utf8");
    const workflow = readFileSync(".github/workflows/build-macos.yml", "utf8");

    expect(existsSync("scripts/notarize-macos-dmg.sh")).toBe(true);
    expect(prepareScript).toContain("arm64_sonoma");
    expect(prepareScript).toContain("runtime_already_prepared");
    expect(prepareScript).toContain("ca-certificates|certifi|vulkan-headers");
    expect(prepareScript).toContain("prepare-libmpv-runtime.sh");
    expect(verifyScript).toContain("libmpv.2.dylib");
    expect(verifyScript).toContain("VELO_MACOS_MIN_VERSION");
    expect(verifyScript).toContain("otool -L");
    expect(verifyScript).toContain("vtool -show-build");
    expect(workflow).toContain("runs-on: macos-14");
    expect(workflow).toContain("MACOSX_DEPLOYMENT_TARGET: \"14.0\"");
    expect(workflow).toContain("npm run package:macos:release");
    expect(workflow).toContain("npm run package:macos:local");
    expect(viteConfig).toContain("**/src-tauri/target/**");
  });

  test("Windows runtime 脚本从 MSYS2 UCRT 包准备内嵌 libmpv", () => {
    const prepareScript = readFileSync("scripts/prepare-windows-mpv-runtime.sh", "utf8");

    expect(prepareScript).toContain("mingw-w64-ucrt-x86_64-mpv");
    expect(prepareScript).toContain("MPV_WINDOWS_SOURCE_DIR");
    expect(prepareScript).toContain("libmpv-2.dll");
    expect(prepareScript).toContain("copy_runtime_closure");
    expect(prepareScript).toContain("objdump");
    expect(prepareScript).toContain("pacman -S --needed --noconfirm");
    expect(prepareScript).toContain("MPV_WINDOWS_PACMAN_INSTALL_TIMEOUT");
    expect(prepareScript).toContain("timeout");
    expect(prepareScript).not.toContain("github.com/mpv-player/mpv/releases");
    expect(prepareScript).not.toContain('pacman -Sp "${MSYS2_MPV_PACKAGE}"');
  });
});
