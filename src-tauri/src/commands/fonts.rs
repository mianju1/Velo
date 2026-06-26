use std::{collections::HashSet, process::Command};

#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    normalize_font_names(query_system_font_names())
}

fn normalize_font_names(names: Vec<String>) -> Vec<String> {
    let mut seen_names = HashSet::new();
    let mut normalized_names = names
        .into_iter()
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
        .collect::<Vec<_>>();

    normalized_names.sort_by_key(|name| name.to_lowercase());
    normalized_names.retain(|name| seen_names.insert(name.to_lowercase()));
    normalized_names
}

#[cfg(target_os = "windows")]
fn query_system_font_names() -> Vec<String> {
    command_stdout_lines(
        "powershell",
        &[
            "-NoProfile",
            "-Command",
            "$OutputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); Add-Type -AssemblyName System.Drawing; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }",
        ],
    )
}

#[cfg(target_os = "linux")]
fn query_system_font_names() -> Vec<String> {
    command_stdout_lines("fc-list", &[":", "family"])
        .into_iter()
        .flat_map(|line| {
            line.split(',')
                .map(|family| family.trim().to_string())
                .collect::<Vec<_>>()
        })
        .collect()
}

#[cfg(target_os = "macos")]
fn query_system_font_names() -> Vec<String> {
    command_stdout_lines(
        "mdfind",
        &[
            "kMDItemContentType == 'public.truetype-font' || kMDItemContentType == 'public.opentype-font'",
        ],
    )
    .into_iter()
    .filter_map(|path| {
        std::path::Path::new(&path)
            .file_stem()
            .and_then(|stem| stem.to_str())
            .map(|stem| stem.to_string())
    })
    .collect()
}

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
fn query_system_font_names() -> Vec<String> {
    Vec::new()
}

fn command_stdout_lines(command: &str, args: &[&str]) -> Vec<String> {
    Command::new(command)
        .args(args)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .map(|line| line.to_string())
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::normalize_font_names;

    #[test]
    fn normalizes_font_names_case_insensitively() {
        let names = normalize_font_names(vec![
            " Segoe UI ".to_string(),
            "".to_string(),
            "Arial".to_string(),
            "segoe ui".to_string(),
            "MapleMono-CN".to_string(),
        ]);

        assert_eq!(names, vec!["Arial", "MapleMono-CN", "Segoe UI"]);
    }
}
