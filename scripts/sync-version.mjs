import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[\dA-Za-z-]*[A-Za-z-][\dA-Za-z-]*)(?:\.(?:0|[1-9]\d*|[\dA-Za-z-]*[A-Za-z-][\dA-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function readText(path) {
  return readFileSync(path, "utf8");
}

function writeText(path, value) {
  writeFileSync(path, value);
}

function readJson(path) {
  return JSON.parse(readText(path));
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function resolveCargoToml(root) {
  const tauriCargoToml = join(root, "src-tauri", "Cargo.toml");

  try {
    readText(tauriCargoToml);
    return tauriCargoToml;
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  return join(root, "Cargo.toml");
}

function readRequestedVersion(root, versionArg) {
  const version = versionArg ?? readText(join(root, "VERSION")).trim();

  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Invalid version "${version}". Expected semver like x.y.z.`);
  }

  return version;
}

function updateCargoToml(path, version) {
  const cargoToml = readText(path);
  const packageVersionPattern = /^(\[package\][\s\S]*?^version = )"[^"]+"/m;

  if (!packageVersionPattern.test(cargoToml)) {
    throw new Error(`Cargo manifest at ${path} must contain [package] version`);
  }

  const updated = cargoToml.replace(packageVersionPattern, `$1"${version}"`);

  writeText(path, updated);
}

function syncVersion(root, versionArg) {
  const version = readRequestedVersion(root, versionArg);
  const versionPath = join(root, "VERSION");
  const packageJsonPath = join(root, "package.json");
  const packageLockPath = join(root, "package-lock.json");
  const cargoTomlPath = resolveCargoToml(root);

  const packageJson = readJson(packageJsonPath);
  const packageLock = readJson(packageLockPath);

  packageJson.version = version;
  packageLock.version = version;
  packageLock.packages ??= {};
  packageLock.packages[""] ??= {};
  packageLock.packages[""].version = version;

  writeText(versionPath, `${version}\n`);
  writeJson(packageJsonPath, packageJson);
  writeJson(packageLockPath, packageLock);
  updateCargoToml(cargoTomlPath, version);

  return version;
}

try {
  const version = syncVersion(process.cwd(), process.argv[2]);
  console.log(`Synced version ${version}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
