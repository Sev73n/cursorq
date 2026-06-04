#!/usr/bin/env bash
# CursorQ — Git Bash 启动 Tauri（自动走 MSVC + cargo）
set -euo pipefail

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${_SCRIPT_DIR}/.." && pwd)"

export PATH="${HOME}/.cargo/bin:${PATH}"

if command -v cygpath >/dev/null 2>&1; then
  ROOT_WIN="$(cygpath -w "${ROOT}")"
else
  # Git Bash: pwd -W
  ROOT_WIN="$(cd "${ROOT}" && pwd -W 2>/dev/null || echo "${ROOT}")"
fi

CMD_FILE="${ROOT_WIN}\\scripts\\dev-tauri.cmd"
if [[ ! -f "${ROOT}/scripts/dev-tauri.cmd" ]]; then
  echo "[cursorq] missing scripts/dev-tauri.cmd" >&2
  exit 1
fi

echo "[cursorq] Bash → MSVC env → Tauri dev (first Rust build may take 5–15 min)"
exec cmd.exe //d //s //c "${CMD_FILE}"
