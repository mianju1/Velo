#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${ROOT_DIR}/src-tauri/runtime/windows/bin"
MSYS2_MPV_PACKAGE="${MPV_WINDOWS_MSYS2_PACKAGE:-mingw-w64-ucrt-x86_64-mpv}"
PACMAN_INSTALL_TIMEOUT="${MPV_WINDOWS_PACMAN_INSTALL_TIMEOUT:-540}"

has_libmpv_runtime() {
  [[ -x "${RUNTIME_DIR}/mpv.exe" ]] &&
    [[ -f "${RUNTIME_DIR}/libmpv-2.dll" || -f "${RUNTIME_DIR}/mpv-2.dll" || -f "${RUNTIME_DIR}/libmpv.dll" ]]
}

is_windows_system_dll() {
  local dll="${1,,}"
  [[ "${dll}" == api-ms-* || "${dll}" == ext-ms-* ]] && return 0
  case "${dll}" in
    advapi32.dll|avicap32.dll|avrt.dll|bcrypt.dll|bcryptprimitives.dll|cfgmgr32.dll|combase.dll|comctl32.dll|comdlg32.dll|crypt32.dll|dbghelp.dll|dnsapi.dll|dwmapi.dll|dwrite.dll|gdi32.dll|gdiplus.dll|hid.dll|imm32.dll|iphlpapi.dll|kernel32.dll|ksuser.dll|mf.dll|mfplat.dll|mfreadwrite.dll|mfuuid.dll|msacm32.dll|msimg32.dll|msvcrt.dll|ncrypt.dll|netapi32.dll|ntdll.dll|ole32.dll|oleaut32.dll|opengl32.dll|powrprof.dll|propsys.dll|psapi.dll|rpcrt4.dll|secur32.dll|setupapi.dll|shcore.dll|shell32.dll|shlwapi.dll|user32.dll|userenv.dll|usp10.dll|uxtheme.dll|version.dll|winhttp.dll|winmm.dll|winspool.drv|ws2_32.dll|wsock32.dll)
      return 0
      ;;
  esac
  return 1
}

copy_runtime_from_dir() {
  local source_dir="$1"
  [[ -f "${source_dir}/mpv.exe" && -f "${source_dir}/libmpv-2.dll" ]] || return 1

  rm -rf "${RUNTIME_DIR}"
  mkdir -p "${RUNTIME_DIR}"
  copy_runtime_closure "${source_dir}"
  has_libmpv_runtime
}

if has_libmpv_runtime; then
  echo "Windows libmpv runtime already exists: ${RUNTIME_DIR}"
  exit 0
fi

for command in cp find mkdir pacman rm sed timeout; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Missing ${command}; run this script from an MSYS2 shell with pacman available." >&2
    exit 1
  fi
done

OBJDUMP="${OBJDUMP:-$(command -v objdump || command -v /ucrt64/bin/objdump || true)}"
if [[ -z "${OBJDUMP}" || ! -x "${OBJDUMP}" ]]; then
  echo "Missing objdump; install the MSYS2 UCRT toolchain or set OBJDUMP." >&2
  exit 1
fi

source_dirs=()
if [[ -n "${MPV_WINDOWS_SOURCE_DIR:-}" ]]; then
  source_dirs+=("${MPV_WINDOWS_SOURCE_DIR}")
fi
if [[ -n "${MSYSTEM_PREFIX:-}" ]]; then
  source_dirs+=("${MSYSTEM_PREFIX}/bin")
fi
source_dirs+=("/ucrt64/bin" "/c/msys64/ucrt64/bin")

copy_runtime_closure() {
  local source_dir="$1"
  local -a queue=("mpv.exe" "libmpv-2.dll")
  local copied_count=0
  local item source_path

  while ((${#queue[@]} > 0)); do
    item="${queue[0]}"
    queue=("${queue[@]:1}")

    if is_windows_system_dll "${item}" || [[ -f "${RUNTIME_DIR}/${item}" ]]; then
      continue
    fi

    source_path="${source_dir}/${item}"
    if [[ ! -f "${source_path}" ]]; then
      echo "Missing Windows libmpv dependency ${item} in ${source_dir}." >&2
      return 1
    fi

    cp -f "${source_path}" "${RUNTIME_DIR}/${item}"
    copied_count=$((copied_count + 1))
    if ((copied_count > 400)); then
      echo "Windows libmpv dependency closure exceeded 400 files." >&2
      return 1
    fi

    while IFS= read -r imported; do
      [[ -n "${imported}" ]] && queue+=("${imported}")
    done < <("${OBJDUMP}" -p "${source_path}" 2>/dev/null | sed -n 's/.*DLL Name: //p')
  done
}

for source_dir in "${source_dirs[@]}"; do
  if copy_runtime_from_dir "${source_dir}"; then
    echo "Windows libmpv runtime copied from: ${source_dir}"
    echo "Windows libmpv runtime prepared at: ${RUNTIME_DIR}"
    exit 0
  fi
done

echo "Installing MSYS2 UCRT mpv package when needed: ${MSYS2_MPV_PACKAGE}"
if ! timeout "${PACMAN_INSTALL_TIMEOUT}" pacman -S --needed --noconfirm "${MSYS2_MPV_PACKAGE}"; then
  echo "Failed to install ${MSYS2_MPV_PACKAGE} within ${PACMAN_INSTALL_TIMEOUT}s." >&2
  exit 1
fi

for source_dir in "${source_dirs[@]}"; do
  if copy_runtime_from_dir "${source_dir}"; then
    echo "Windows libmpv runtime copied from: ${source_dir}"
    echo "Windows libmpv runtime prepared at: ${RUNTIME_DIR}"
    exit 0
  fi
done

echo "Windows libmpv runtime preparation failed: mpv.exe or libmpv-2.dll is missing from MSYS2 UCRT." >&2
exit 1
