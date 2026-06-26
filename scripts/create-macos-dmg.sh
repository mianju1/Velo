#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="${MACOS_APP_PATH:-${ROOT_DIR}/src-tauri/target/release/bundle/macos/Velo.app}"
DMG_DIR="${ROOT_DIR}/src-tauri/target/release/bundle/dmg"
DMG_PATH="${MACOS_DMG_PATH:-${DMG_DIR}/Velo_0.1.0_aarch64.dmg}"
VOLUME_NAME="${MACOS_DMG_VOLUME_NAME:-Velo}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "当前脚本只支持 macOS。"
  exit 1
fi

if [[ ! -d "${APP_PATH}" ]]; then
  echo "未找到 macOS app：${APP_PATH}" >&2
  exit 1
fi

mkdir -p "${DMG_DIR}"
rm -f "${DMG_PATH}"
hdiutil create \
  -volname "${VOLUME_NAME}" \
  -srcfolder "${APP_PATH}" \
  -ov \
  -format UDZO \
  "${DMG_PATH}" >/dev/null

echo "macOS dmg 已生成：${DMG_PATH}"
