#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DMG_PATH="${MACOS_DMG_PATH:-${ROOT_DIR}/src-tauri/target/release/bundle/dmg/Velo_0.1.0_aarch64.dmg}"

case "${MACOS_NOTARIZE:-0}" in
  1|true|TRUE|yes|YES)
    ;;
  *)
    if [[ "${MACOS_NOTARIZE_REQUIRED:-0}" =~ ^(1|true|TRUE|yes|YES)$ ]]; then
      echo "正式 macOS 分发包必须公证，请设置 MACOS_NOTARIZE=1 和 Apple 公证凭据。" >&2
      exit 1
    fi
    echo "未启用 macOS 公证；如需公证请设置 MACOS_NOTARIZE=1。"
    exit 0
    ;;
esac

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "当前脚本只支持 macOS。"
  exit 1
fi

if [[ ! -f "${DMG_PATH}" ]]; then
  echo "未找到 macOS dmg：${DMG_PATH}" >&2
  exit 1
fi

if [[ "${MACOS_CODESIGN_IDENTITY:--}" == "-" ]]; then
  echo "公证需要 Developer ID Application 签名，请设置 MACOS_CODESIGN_IDENTITY。" >&2
  exit 1
fi

if [[ -n "${MACOS_NOTARY_KEYCHAIN_PROFILE:-}" ]]; then
  xcrun notarytool submit "${DMG_PATH}" \
    --keychain-profile "${MACOS_NOTARY_KEYCHAIN_PROFILE}" \
    --wait
else
  : "${APPLE_ID:?请设置 APPLE_ID 或 MACOS_NOTARY_KEYCHAIN_PROFILE}"
  : "${APPLE_TEAM_ID:?请设置 APPLE_TEAM_ID 或 MACOS_NOTARY_KEYCHAIN_PROFILE}"
  : "${APPLE_APP_SPECIFIC_PASSWORD:?请设置 APPLE_APP_SPECIFIC_PASSWORD 或 MACOS_NOTARY_KEYCHAIN_PROFILE}"
  xcrun notarytool submit "${DMG_PATH}" \
    --apple-id "${APPLE_ID}" \
    --team-id "${APPLE_TEAM_ID}" \
    --password "${APPLE_APP_SPECIFIC_PASSWORD}" \
    --wait
fi

xcrun stapler staple "${DMG_PATH}"
echo "macOS dmg 已公证并装订：${DMG_PATH}"
