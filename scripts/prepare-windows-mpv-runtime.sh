#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${ROOT_DIR}/src-tauri/runtime/windows/bin"
MPV_VERSION="${MPV_WINDOWS_VERSION:-v0.41.0}"
MPV_TARGET="${MPV_WINDOWS_TARGET:-x86_64-w64-mingw32}"
MPV_URL="${MPV_WINDOWS_URL:-https://github.com/mpv-player/mpv/releases/download/${MPV_VERSION}/mpv-${MPV_VERSION}-${MPV_TARGET}.zip}"

if [[ -x "${RUNTIME_DIR}/mpv.exe" ]]; then
  echo "Windows mpv 运行时已存在：${RUNTIME_DIR}"
  exit 0
fi

for command in curl bsdtar; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "缺少 ${command}，无法准备 Windows mpv 运行时" >&2
    exit 1
  fi
done

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

OUTER_ZIP="${TMP_DIR}/mpv-windows.zip"
echo "下载 Windows mpv 运行时：${MPV_URL}"
curl -L --fail --show-error --silent -o "${OUTER_ZIP}" "${MPV_URL}"

bsdtar -xf "${OUTER_ZIP}" -C "${TMP_DIR}"
INNER_ZIP="$(find "${TMP_DIR}" -maxdepth 1 -type f -name 'mpv-*.zip' ! -name 'mpv-windows.zip' -print -quit)"
if [[ -z "${INNER_ZIP}" ]]; then
  echo "mpv 压缩包格式不符合预期：未找到内层 mpv zip" >&2
  exit 1
fi

rm -rf "${RUNTIME_DIR}"
mkdir -p "${RUNTIME_DIR}"
bsdtar -xf "${INNER_ZIP}" -C "${RUNTIME_DIR}"

if [[ ! -f "${RUNTIME_DIR}/mpv.exe" ]]; then
  echo "mpv 压缩包格式不符合预期：未找到 mpv.exe" >&2
  exit 1
fi

echo "Windows mpv 运行时已准备到：${RUNTIME_DIR}"
