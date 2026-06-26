#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PATH="${MACOS_APP_PATH:-${ROOT_DIR}/src-tauri/target/release/bundle/macos/Velo.app}"
FRAMEWORKS_DIR="${APP_PATH}/Contents/Frameworks"
VELO_MACOS_MIN_VERSION="${VELO_MACOS_MIN_VERSION:-14.0}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "当前脚本只支持 macOS。"
  exit 1
fi

if [[ ! -d "${APP_PATH}" ]]; then
  echo "未找到 macOS app：${APP_PATH}" >&2
  exit 1
fi

if [[ ! -d "${FRAMEWORKS_DIR}" ]]; then
  echo "macOS app 缺少 Frameworks 目录：${FRAMEWORKS_DIR}" >&2
  exit 1
fi

if [[ ! -f "${FRAMEWORKS_DIR}/libmpv.2.dylib" && ! -f "${FRAMEWORKS_DIR}/libmpv.dylib" ]]; then
  echo "macOS app 未包含内嵌 libmpv.2.dylib。" >&2
  exit 1
fi

version_gt() {
  local lhs="$1"
  local rhs="$2"
  awk -v lhs="${lhs}" -v rhs="${rhs}" '
    BEGIN {
      split(lhs, left, ".")
      split(rhs, right, ".")
      for (part_index = 1; part_index <= 4; part_index++) {
        left_part = left[part_index] + 0
        right_part = right[part_index] + 0
        if (left_part > right_part) exit 0
        if (left_part < right_part) exit 1
      }
      exit 1
    }
  '
}

resolve_framework_dependency() {
  local mach_file="$1"
  local dependency="$2"

  case "${dependency}" in
    /System/*|/usr/lib/*)
      return 0
      ;;
    @loader_path/*)
      [[ -e "$(dirname "${mach_file}")/${dependency#@loader_path/}" ]]
      return
      ;;
    @executable_path/../Frameworks/*)
      [[ -e "${FRAMEWORKS_DIR}/${dependency#@executable_path/../Frameworks/}" ]]
      return
      ;;
    @rpath/*)
      [[ -e "${FRAMEWORKS_DIR}/${dependency#@rpath/}" ]]
      return
      ;;
    /*)
      return 1
      ;;
    *)
      return 1
      ;;
  esac
}

failed=0
while IFS= read -r -d '' mach_file; do
  if ! otool -L "${mach_file}" >/dev/null 2>&1; then
    continue
  fi

  minos="$(vtool -show-build "${mach_file}" 2>/dev/null | awk '/minos/{print $2; exit}' || true)"
  if [[ -n "${minos}" ]] && version_gt "${minos}" "${VELO_MACOS_MIN_VERSION}"; then
    echo "macOS 运行时不兼容目标系统：$(basename "${mach_file}") minos=${minos} > ${VELO_MACOS_MIN_VERSION}" >&2
    failed=1
  fi

  skip_install_name=0
  if otool -D "${mach_file}" 2>/dev/null | tail -n +2 | grep -q .; then
    skip_install_name=1
  fi

  while read -r dependency _; do
    [[ -z "${dependency}" ]] && continue
    if [[ "${skip_install_name}" -eq 1 ]]; then
      skip_install_name=0
      continue
    fi
    if ! resolve_framework_dependency "${mach_file}" "${dependency}"; then
      echo "macOS 运行时存在未打包或未改写的依赖：$(basename "${mach_file}") -> ${dependency}" >&2
      failed=1
    fi
  done < <(otool -L "${mach_file}" | tail -n +2)
done < <(find -L "${FRAMEWORKS_DIR}" -type f ! -name ".gitkeep" -print0)

if [[ "${failed}" -ne 0 ]]; then
  cat >&2 <<EOF

macOS app 中的 libmpv 运行时不能安全分发给 macOS ${VELO_MACOS_MIN_VERSION}。
请在 macOS ${VELO_MACOS_MIN_VERSION} 或兼容构建环境中重新生成运行时后再打包。
EOF
  exit 1
fi

echo "macOS 内嵌 libmpv 运行时验收通过：${FRAMEWORKS_DIR}"
