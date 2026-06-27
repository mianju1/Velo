use std::{env, fs, path::Path};

fn main() {
    verify_package_version_matches_cargo();
    tauri_build::build()
}

fn verify_package_version_matches_cargo() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR must be set");
    let package_json_path = Path::new(&manifest_dir).join("../package.json");
    let version_path = Path::new(&manifest_dir).join("../VERSION");

    println!("cargo:rerun-if-changed={}", package_json_path.display());
    println!("cargo:rerun-if-changed={}", version_path.display());
    println!("cargo:rerun-if-changed=Cargo.toml");

    let source_version = fs::read_to_string(&version_path)
        .unwrap_or_else(|error| {
            panic!(
                "failed to read root VERSION at {}: {error}",
                version_path.display()
            )
        })
        .trim()
        .to_owned();
    let package_json = fs::read_to_string(&package_json_path).unwrap_or_else(|error| {
        panic!(
            "failed to read root package.json at {}: {error}",
            package_json_path.display()
        )
    });
    let package_version = serde_json::from_str::<serde_json::Value>(&package_json)
        .ok()
        .and_then(|json| json.get("version").and_then(|version| version.as_str()).map(str::to_owned))
        .unwrap_or_else(|| {
            panic!(
                "root package.json at {} must contain a string version",
                package_json_path.display()
            )
        });
    let cargo_version = env!("CARGO_PKG_VERSION");

    if source_version != package_version {
        panic!(
            "version mismatch: VERSION has {source_version}, but package.json has {package_version}"
        );
    }

    if package_version != cargo_version {
        panic!(
            "version mismatch: package.json has {package_version}, but src-tauri/Cargo.toml has {cargo_version}"
        );
    }
}
