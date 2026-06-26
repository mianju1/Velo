#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="${MACOS_APP_PATH:-${ROOT_DIR}/src-tauri/target/release/bundle/macos/Velo.app}"
IDENTITY="${MACOS_CODESIGN_IDENTITY:--}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "当前脚本只支持 macOS。"
  exit 1
fi

if [[ ! -d "${APP_PATH}" ]]; then
  echo "未找到 macOS app：${APP_PATH}" >&2
  exit 1
fi

FRAMEWORKS_DIR="${APP_PATH}/Contents/Frameworks"
if [[ -d "${FRAMEWORKS_DIR}" ]]; then
  while IFS= read -r -d '' file; do
    if [[ "${IDENTITY}" == "-" ]]; then
      codesign --force --sign "${IDENTITY}" --timestamp=none "${file}"
    else
      codesign --force --sign "${IDENTITY}" --timestamp --options runtime "${file}"
    fi
  done < <(find "${FRAMEWORKS_DIR}" -type f \( -name '*.dylib' -o -perm -111 \) -print0)
fi

if [[ "${IDENTITY}" == "-" ]]; then
  codesign --force --deep --sign "${IDENTITY}" --timestamp=none "${APP_PATH}"
else
  codesign --force --deep --sign "${IDENTITY}" --timestamp --options runtime "${APP_PATH}"
fi
codesign --verify --deep --strict --verbose=2 "${APP_PATH}"

echo "macOS app 已签名：${APP_PATH}"
