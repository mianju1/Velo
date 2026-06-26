#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${ROOT_DIR}/src-tauri/runtime/macos/lib"
VELO_MACOS_MIN_VERSION="${VELO_MACOS_MIN_VERSION:-14.0}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "当前脚本只支持 macOS。"
  exit 1
fi

mkdir -p "${RUNTIME_DIR}"
find "${RUNTIME_DIR}" -mindepth 1 ! -name ".gitkeep" -exec rm -rf {} +
VISITED_DYLIBS=""

resolve_dependency_path() {
  local dependency="$1"
  local source_dir="$2"

  case "${dependency}" in
    /System/*|/usr/lib/*)
      return 1
      ;;
    @@HOMEBREW_PREFIX@@/*)
      if [[ -n "${VELO_HOMEBREW_PREFIX_DIR:-}" ]]; then
        local rewritten="${VELO_HOMEBREW_PREFIX_DIR}/${dependency#@@HOMEBREW_PREFIX@@/}"
        if [[ -f "${rewritten}" ]]; then
          echo "${rewritten}"
          return 0
        fi
      fi
      return 1
      ;;
    @loader_path/*)
      local rewritten="${source_dir}/${dependency#@loader_path/}"
      if [[ -f "${rewritten}" ]]; then
        echo "${rewritten}"
        return 0
      fi
      return 1
      ;;
    @*)
      return 1
      ;;
    *)
      if [[ -f "${dependency}" ]]; then
        echo "${dependency}"
        return 0
      fi
      return 1
      ;;
  esac
}

find_libmpv() {
  if [[ -n "${VELO_LIBMPV_SOURCE_DIR:-}" ]]; then
    for name in libmpv.2.dylib libmpv.dylib; do
      if [[ -f "${VELO_LIBMPV_SOURCE_DIR}/${name}" ]]; then
        echo "${VELO_LIBMPV_SOURCE_DIR}/${name}"
        return 0
      fi
    done
  fi

  local candidates=()
  if command -v brew >/dev/null 2>&1; then
    local brew_prefixes=()
    if brew --prefix mpv >/dev/null 2>&1; then
      brew_prefixes+=("$(brew --prefix mpv)")
    fi
    if brew --prefix >/dev/null 2>&1; then
      brew_prefixes+=("$(brew --prefix)")
    fi
    for prefix in "${brew_prefixes[@]}"; do
      candidates+=("${prefix}/lib/libmpv.2.dylib" "${prefix}/lib/libmpv.dylib")
    done
  fi
  candidates+=(
    "/opt/homebrew/lib/libmpv.2.dylib"
    "/opt/homebrew/lib/libmpv.dylib"
    "/usr/local/lib/libmpv.2.dylib"
    "/usr/local/lib/libmpv.dylib"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -f "${candidate}" ]]; then
      echo "${candidate}"
      return 0
    fi
  done

  return 1
}

copy_dylib_closure() {
  local source="$1"
  local source_real
  source_real="$(realpath "${source}")"
  local source_basename real_basename
  source_basename="$(basename "${source}")"
  real_basename="$(basename "${source_real}")"
  local target="${RUNTIME_DIR}/${real_basename}"

  if [[ "${VISITED_DYLIBS}" == *"|${source_real}|"* ]]; then
    if [[ "${source_basename}" != "${real_basename}" && ! -e "${RUNTIME_DIR}/${source_basename}" ]]; then
      ln -s "${real_basename}" "${RUNTIME_DIR}/${source_basename}"
    fi
    return 0
  fi
  VISITED_DYLIBS="${VISITED_DYLIBS}|${source_real}|"

  if [[ ! -f "${target}" ]]; then
    cp -f "${source_real}" "${target}"
    chmod u+rw,go+r "${target}"
  fi

  if [[ "${source_basename}" != "${real_basename}" && ! -e "${RUNTIME_DIR}/${source_basename}" ]]; then
    ln -s "${real_basename}" "${RUNTIME_DIR}/${source_basename}"
  fi

  local dependency resolved_dependency
  while read -r dependency; do
    [[ -z "${dependency}" ]] && continue
    resolved_dependency="$(resolve_dependency_path "${dependency}" "$(dirname "${source_real}")" || true)"
    [[ -n "${resolved_dependency}" ]] || continue
    copy_dylib_closure "${resolved_dependency}"
  done < <(otool -L "${source_real}" | tail -n +2 | awk '{print $1}')
}

rewrite_install_names() {
  local runtime_file
  for runtime_file in "${RUNTIME_DIR}"/*; do
    [[ -f "${runtime_file}" ]] || continue
    chmod u+rw,go+r "${runtime_file}" 2>/dev/null || true
  done

  local mach_file
  for mach_file in "${RUNTIME_DIR}"/*; do
    [[ -f "${mach_file}" ]] || continue
    otool -L "${mach_file}" >/dev/null 2>&1 || continue

    install_name_tool -id "@rpath/$(basename "${mach_file}")" "${mach_file}" 2>/dev/null || true

    local dependency
    while read -r dependency; do
      [[ -z "${dependency}" ]] && continue
      [[ "${dependency}" == /System/* || "${dependency}" == /usr/lib/* ]] && continue
      local dependency_basename
      dependency_basename="$(basename "${dependency}")"
      if [[ -f "${RUNTIME_DIR}/${dependency_basename}" ]]; then
        install_name_tool -change "${dependency}" "@loader_path/${dependency_basename}" "${mach_file}" 2>/dev/null || true
      fi
    done < <(otool -L "${mach_file}" | tail -n +2 | awk '{print $1}')

    codesign --force --sign - "${mach_file}" >/dev/null 2>&1 || true
  done
}

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

validate_runtime_macos_versions() {
  local failed=0
  local mach_file minos
  for mach_file in "${RUNTIME_DIR}"/*; do
    [[ -f "${mach_file}" ]] || continue
    minos="$(vtool -show-build "${mach_file}" 2>/dev/null | awk '/minos/{print $2; exit}')"
    [[ -n "${minos}" ]] || continue
    if version_gt "${minos}" "${VELO_MACOS_MIN_VERSION}"; then
      echo "macOS 运行时不兼容目标系统：$(basename "${mach_file}") minos=${minos} > ${VELO_MACOS_MIN_VERSION}" >&2
      failed=1
    fi
  done

  if [[ "${failed}" -ne 0 ]]; then
    cat >&2 <<EOF

当前 libmpv 运行时不能用于面向 macOS ${VELO_MACOS_MIN_VERSION} 的内嵌播放器分发。
请提供一套用 MACOSX_DEPLOYMENT_TARGET=${VELO_MACOS_MIN_VERSION} 或更低版本构建的 libmpv dylib 及依赖，
并通过 VELO_LIBMPV_SOURCE_DIR 指向该目录后重新运行。
EOF
    exit 1
  fi
}

libmpv_path="$(find_libmpv || true)"
if [[ -z "${libmpv_path}" ]]; then
  cat >&2 <<'EOF'
未找到可复制的 libmpv 动态库。

开发期可执行：
  brew install mpv

或者设置 VELO_LIBMPV_SOURCE_DIR 指向包含 libmpv.2.dylib 的目录后重新运行本脚本。
EOF
  exit 1
fi

copy_dylib_closure "${libmpv_path}"
if [[ -f "${RUNTIME_DIR}/libmpv.2.dylib" && ! -e "${RUNTIME_DIR}/libmpv.dylib" ]]; then
  ln -s "libmpv.2.dylib" "${RUNTIME_DIR}/libmpv.dylib"
fi
rewrite_install_names
validate_runtime_macos_versions

echo "libmpv 运行时已准备到：${RUNTIME_DIR}"
