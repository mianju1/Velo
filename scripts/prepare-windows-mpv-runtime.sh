#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${ROOT_DIR}/src-tauri/runtime/windows/bin"
MSYS2_MPV_PACKAGE="${MPV_WINDOWS_MSYS2_PACKAGE:-mingw-w64-ucrt-x86_64-mpv}"

has_libmpv_runtime() {
  [[ -x "${RUNTIME_DIR}/mpv.exe" ]] &&
    [[ -f "${RUNTIME_DIR}/libmpv-2.dll" || -f "${RUNTIME_DIR}/mpv-2.dll" || -f "${RUNTIME_DIR}/libmpv.dll" ]]
}

if has_libmpv_runtime; then
  echo "Windows libmpv runtime already exists: ${RUNTIME_DIR}"
  exit 0
fi

for command in awk basename bsdtar curl find mkdir pacman rm; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Missing ${command}; run this script from an MSYS2 shell with pacman available." >&2
    exit 1
  fi
done

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

PACKAGE_DIR="${TMP_DIR}/packages"
EXTRACT_DIR="${TMP_DIR}/extract"
mkdir -p "${PACKAGE_DIR}" "${EXTRACT_DIR}"

echo "Resolving Windows libmpv runtime packages from MSYS2: ${MSYS2_MPV_PACKAGE}"
mapfile -t package_urls < <(pacman -Sp "${MSYS2_MPV_PACKAGE}" | awk '/^https?:\/\// { print }')
if [[ "${#package_urls[@]}" -eq 0 ]]; then
  echo "Unable to resolve MSYS2 package URLs for ${MSYS2_MPV_PACKAGE}." >&2
  exit 1
fi

for url in "${package_urls[@]}"; do
  package_path="${PACKAGE_DIR}/$(basename "${url}")"
  echo "Downloading ${url}"
  curl -L --fail --show-error --silent \
    --retry 5 --retry-delay 2 --retry-all-errors --connect-timeout 30 \
    -o "${package_path}" "${url}"
  bsdtar -xf "${package_path}" -C "${EXTRACT_DIR}"
done

if [[ ! -f "${EXTRACT_DIR}/ucrt64/bin/mpv.exe" ]]; then
  echo "MSYS2 mpv package layout is unexpected: mpv.exe was not found." >&2
  exit 1
fi

if [[ ! -f "${EXTRACT_DIR}/ucrt64/bin/libmpv-2.dll" ]]; then
  echo "MSYS2 mpv package layout is unexpected: libmpv-2.dll was not found." >&2
  exit 1
fi

rm -rf "${RUNTIME_DIR}"
mkdir -p "${RUNTIME_DIR}"
find "${EXTRACT_DIR}/ucrt64/bin" -maxdepth 1 -type f \( -name '*.dll' -o -name 'mpv.exe' \) \
  -exec cp -f {} "${RUNTIME_DIR}/" \;

if ! has_libmpv_runtime; then
  echo "Windows libmpv runtime preparation failed: mpv.exe or libmpv DLL is missing." >&2
  exit 1
fi

echo "Windows libmpv runtime prepared at: ${RUNTIME_DIR}"
