#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="${VELO_HOMEBREW_BOTTLE_TAG:-arm64_sonoma}"
STAGE_DIR="${VELO_HOMEBREW_STAGE_DIR:-${ROOT_DIR}/src-tauri/target/homebrew-bottles/${TAG}}"
CELLAR_DIR="${STAGE_DIR}/Cellar"
OPT_DIR="${STAGE_DIR}/opt"
RUNTIME_DIR="${ROOT_DIR}/src-tauri/runtime/macos/lib"
VELO_MACOS_MIN_VERSION="${VELO_MACOS_MIN_VERSION:-14.0}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "当前脚本只支持 macOS。"
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "未找到 Homebrew，无法下载 macOS ${TAG} libmpv 运行时瓶子。" >&2
  exit 1
fi

cache_dir="$(brew --cache)/downloads"
mkdir -p "${CELLAR_DIR}" "${OPT_DIR}"

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

runtime_already_prepared() {
  local libmpv="${RUNTIME_DIR}/libmpv.2.dylib"
  [[ -f "${libmpv}" ]] || return 1
  local minos
  minos="$(vtool -show-build "${libmpv}" 2>/dev/null | awk '/minos/{print $2; exit}' || true)"
  [[ -n "${minos}" ]] || return 1
  ! version_gt "${minos}" "${VELO_MACOS_MIN_VERSION}"
}

if runtime_already_prepared; then
  echo "复用已准备好的 macOS libmpv 运行时：${RUNTIME_DIR}"
  exit 0
fi

find_bottle_path() {
  local formula="$1"
  local cache_path
  cache_path="$(brew --cache --bottle-tag="${TAG}" "${formula}" 2>/dev/null || true)"
  if [[ -n "${cache_path}" && -f "${cache_path}" ]]; then
    echo "${cache_path}"
    return 0
  fi

  local escaped_formula
  escaped_formula="${formula//\//-}"
  find "${cache_dir}" -maxdepth 1 -type f \
    \( -name "*${escaped_formula}-*${TAG}.bottle*.tar.gz" -o -name "*${escaped_formula}--*${TAG}.bottle*.tar.gz" \) \
    -print0 |
    xargs -0 ls -t 2>/dev/null |
    head -n 1
}

runtime_dependencies() {
  local manifest
  manifest="$(find "${cache_dir}" -maxdepth 1 -type f -name "*mpv-0.41.0_4.bottle_manifest.json" -print0 |
    xargs -0 ls -t 2>/dev/null |
    head -n 1)"

  if [[ -z "${manifest}" ]]; then
    echo "未找到 mpv bottle manifest。" >&2
    return 1
  fi

  ruby -rjson -e '
    tag = ENV.fetch("TAG")
    manifest = JSON.parse(File.read(ARGV.fetch(0)))
    item = manifest.fetch("manifests").find { |entry|
      entry.dig("annotations", "org.opencontainers.image.ref.name").to_s.end_with?(tag)
    }
    abort("mpv manifest 缺少 #{tag} 条目") unless item
    tab = JSON.parse(item.dig("annotations", "sh.brew.tab"))
    puts tab.fetch("runtime_dependencies").map { |dep| dep.fetch("full_name") }
  ' "${manifest}"
}

fetch_formula() {
  local formula="$1"
  if [[ -n "$(find_bottle_path "${formula}")" ]]; then
    echo "复用 Homebrew ${TAG} bottle：${formula}"
    return 0
  fi
  echo "下载 Homebrew ${TAG} bottle：${formula}"
  brew fetch --bottle-tag="${TAG}" "${formula}" >/dev/null
}

extract_formula() {
  local formula="$1"
  local required="${2:-0}"
  local bottle_path
  bottle_path="$(find_bottle_path "${formula}")"
  if [[ -z "${bottle_path}" || ! -f "${bottle_path}" ]]; then
    if [[ "${required}" == "1" ]]; then
      echo "未找到 ${formula} 的 ${TAG} bottle。" >&2
      exit 1
    fi
    echo "跳过未找到 ${TAG} bottle 的非必要资源：${formula}" >&2
    return 0
  fi

  tar -xzf "${bottle_path}" -C "${CELLAR_DIR}"

  local formula_dir="${CELLAR_DIR}/${formula}"
  if [[ ! -d "${formula_dir}" ]]; then
    formula_dir="$(find "${CELLAR_DIR}" -mindepth 1 -maxdepth 1 -type d -name "$(basename "${formula}")" -print -quit)"
  fi
  if [[ ! -d "${formula_dir}" ]]; then
    if [[ "${required}" == "1" ]]; then
      echo "bottle 解压后未找到 formula 目录：${formula}" >&2
      exit 1
    fi
    echo "跳过未能识别目录的非必要资源：${formula}" >&2
    return 0
  fi

  local version_dir
  version_dir="$(find "${formula_dir}" -mindepth 1 -maxdepth 1 -type d -print | sort | tail -n 1)"
  if [[ -z "${version_dir}" ]]; then
    if [[ "${required}" == "1" ]]; then
      echo "bottle 解压后未找到版本目录：${formula}" >&2
      exit 1
    fi
    echo "跳过未能识别版本目录的非必要资源：${formula}" >&2
    return 0
  fi

  rm -f "${OPT_DIR}/${formula}"
  ln -s "../Cellar/${formula}/$(basename "${version_dir}")" "${OPT_DIR}/${formula}"
}

fetch_formula "mpv"
formulas_file="${STAGE_DIR}/runtime-formulas.txt"
{
  TAG="${TAG}" runtime_dependencies
  echo "libvmaf"
} | grep -Ev '^(ca-certificates|certifi|vulkan-headers)$' | sort -u > "${formulas_file}"

while IFS= read -r formula; do
  [[ -n "${formula}" ]] || continue
  fetch_formula "${formula}"
done < "${formulas_file}"

extract_formula "mpv" "1"
while IFS= read -r formula; do
  [[ -n "${formula}" ]] || continue
  extract_formula "${formula}"
done < "${formulas_file}"

VELO_HOMEBREW_PREFIX_DIR="${STAGE_DIR}" \
VELO_LIBMPV_SOURCE_DIR="${OPT_DIR}/mpv/lib" \
"${ROOT_DIR}/scripts/prepare-libmpv-runtime.sh"

echo "macOS ${TAG} libmpv 运行时已制备完成。"
