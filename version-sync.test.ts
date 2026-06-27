import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

type PackageJson = {
  version: string;
  scripts?: Record<string, string>;
};

type PackageLock = {
  version: string;
  packages: {
    "": {
      version: string;
    };
  };
};

const repoRoot = resolve(import.meta.dirname);
const scriptPath = join(repoRoot, "scripts", "sync-version.mjs");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function readCargoVersion(path: string): string | undefined {
  return readFileSync(path, "utf8").match(/^version = "([^"]+)"$/m)?.[1];
}

function writeFixture(root: string, version = "0.1.0") {
  writeFileSync(join(root, "VERSION"), `${version}\n`);
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ name: "velo-fixture", version }, null, 2)}\n`,
  );
  writeFileSync(
    join(root, "package-lock.json"),
    `${JSON.stringify(
      {
        name: "velo-fixture",
        version,
        lockfileVersion: 3,
        requires: true,
        packages: {
          "": {
            name: "velo-fixture",
            version,
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(root, "Cargo.toml"), `[package]\nname = "velo-fixture"\nversion = "${version}"\n`);
}

describe("version sync config", () => {
  test("keeps VERSION, package.json, package-lock.json, and Cargo.toml aligned", () => {
    const version = readFileSync("VERSION", "utf8").trim();
    const packageJson = readJson<PackageJson>("package.json");
    const packageLock = readJson<PackageLock>("package-lock.json");
    const cargoVersion = readCargoVersion("src-tauri/Cargo.toml");

    expect(version).toBe("0.1.0");
    expect(packageJson.version).toBe(version);
    expect(packageLock.version).toBe(version);
    expect(packageLock.packages[""].version).toBe(version);
    expect(cargoVersion).toBe(version);
    expect(packageJson.scripts?.["version:set"]).toBe("node scripts/sync-version.mjs");
    expect(existsSync(scriptPath)).toBe(true);
  });

  test("sync script updates fixture files to the requested version", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "velo-version-sync-"));

    try {
      writeFixture(fixtureRoot);

      const result = spawnSync(process.execPath, [scriptPath, "1.2.3"], {
        cwd: fixtureRoot,
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(readFileSync(join(fixtureRoot, "VERSION"), "utf8")).toBe("1.2.3\n");
      expect(readJson<PackageJson>(join(fixtureRoot, "package.json")).version).toBe("1.2.3");
      const packageLock = readJson<PackageLock>(join(fixtureRoot, "package-lock.json"));
      expect(packageLock.version).toBe("1.2.3");
      expect(packageLock.packages[""].version).toBe("1.2.3");
      expect(readCargoVersion(join(fixtureRoot, "Cargo.toml"))).toBe("1.2.3");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test("sync script reads VERSION when no version argument is provided", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "velo-version-sync-"));

    try {
      writeFixture(fixtureRoot, "2.0.0");
      writeFileSync(join(fixtureRoot, "package.json"), `${JSON.stringify({ version: "0.0.1" }, null, 2)}\n`);

      const result = spawnSync(process.execPath, [scriptPath], {
        cwd: fixtureRoot,
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(readJson<PackageJson>(join(fixtureRoot, "package.json")).version).toBe("2.0.0");
      expect(readCargoVersion(join(fixtureRoot, "Cargo.toml"))).toBe("2.0.0");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  test("sync script rejects invalid versions without mutating fixture files", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "velo-version-sync-"));

    try {
      writeFixture(fixtureRoot);

      const result = spawnSync(process.execPath, [scriptPath, "1.2"], {
        cwd: fixtureRoot,
        encoding: "utf8",
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Invalid version");
      expect(readFileSync(join(fixtureRoot, "VERSION"), "utf8")).toBe("0.1.0\n");
      expect(readJson<PackageJson>(join(fixtureRoot, "package.json")).version).toBe("0.1.0");
      expect(readCargoVersion(join(fixtureRoot, "Cargo.toml"))).toBe("0.1.0");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
