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

function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function resolveCargoPaths(root) {
  const tauriCargoToml = join(root, "src-tauri", "Cargo.toml");
  const tauriCargoLock = join(root, "src-tauri", "Cargo.lock");

  try {
    readText(tauriCargoToml);
    return {
      lock: tauriCargoLock,
      toml: tauriCargoToml,
    };
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  return {
    lock: join(root, "Cargo.lock"),
    toml: join(root, "Cargo.toml"),
  };
}

function readRequestedVersion(root, versionArg) {
  const version = versionArg ?? readText(join(root, "VERSION")).trim();

  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Invalid version "${version}". Expected semver like x.y.z.`);
  }

  return version;
}

function replaceTomlPackageVersion(content, path, version) {
  const lines = content.match(/.*(?:\r\n|\n|\r|$)/g) ?? [];
  let inPackage = false;
  let updated = false;
  const updatedLines = lines.map((line) => {
    const lineEnding = line.match(/(\r\n|\n|\r)$/)?.[1] ?? "";
    const body = line.slice(0, line.length - lineEnding.length);
    const tableName = body.match(/^\s*\[+([^\]]+)\]+\s*(?:#.*)?$/)?.[1];

    if (tableName) {
      inPackage = tableName === "package";
      return line;
    }

    if (!inPackage || updated) {
      return line;
    }

    const versionLine = body.match(/^(\s*version\s*=\s*)"[^"]*"(\s*(?:#.*)?)$/);
    if (!versionLine) {
      return line;
    }

    updated = true;
    return `${versionLine[1]}"${version}"${versionLine[2]}${lineEnding}`;
  });

  if (!updated) {
    throw new Error(`Cargo manifest at ${path} must contain [package] version`);
  }

  return updatedLines.join("");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceCargoLockPackageVersion(content, path, packageName, version) {
  const packageNamePattern = new RegExp(`^\\s*name\\s*=\\s*"${escapeRegex(packageName)}"\\s*$`, "m");
  let updated = false;
  const sections = content.split(/(?=^\[\[package\]\])/m);
  const updatedSections = sections.map((section) => {
    if (!packageNamePattern.test(section)) {
      return section;
    }

    const versionPattern = /^(\s*version\s*=\s*)"[^"]*"(\s*)$/m;
    if (!versionPattern.test(section)) {
      throw new Error(`Cargo lock package ${packageName} at ${path} must contain version`);
    }

    updated = true;
    return section.replace(versionPattern, `$1"${version}"$2`);
  });

  if (!updated) {
    throw new Error(`Cargo lock at ${path} must contain package ${packageName}`);
  }

  return updatedSections.join("");
}

function syncVersion(root, versionArg) {
  const version = readRequestedVersion(root, versionArg);
  const versionPath = join(root, "VERSION");
  const packageJsonPath = join(root, "package.json");
  const packageLockPath = join(root, "package-lock.json");
  const cargoPaths = resolveCargoPaths(root);

  const packageJson = readJson(packageJsonPath);
  const packageLock = readJson(packageLockPath);
  const cargoToml = readText(cargoPaths.toml);
  const cargoLock = readText(cargoPaths.lock);

  if (typeof packageJson.name !== "string" || packageJson.name.length === 0) {
    throw new Error(`package.json at ${packageJsonPath} must contain a string name`);
  }

  packageJson.version = version;
  packageLock.version = version;
  packageLock.packages ??= {};
  packageLock.packages[""] ??= {};
  packageLock.packages[""].version = version;

  const writes = [
    [versionPath, `${version}\n`],
    [packageJsonPath, stringifyJson(packageJson)],
    [packageLockPath, stringifyJson(packageLock)],
    [cargoPaths.toml, replaceTomlPackageVersion(cargoToml, cargoPaths.toml, version)],
    [
      cargoPaths.lock,
      replaceCargoLockPackageVersion(cargoLock, cargoPaths.lock, packageJson.name, version),
    ],
  ];

  for (const [path, content] of writes) {
    writeText(path, content);
  }

  return version;
}

try {
  const version = syncVersion(process.cwd(), process.argv[2]);
  console.log(`Synced version ${version}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
