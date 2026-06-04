# CursorQ — Git Bash / MSYS2 环境（可 source）
# 用法: source /e/MyCode/cursorq/scripts/bash-env.sh

if [[ -n "${BASH_SOURCE[0]:-}" ]]; then
  _CQ_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
  _CQ_SCRIPT="$(cd "$(dirname "$0")" && pwd)"
fi
export CURSORQ_ROOT="$(cd "${_CQ_SCRIPT}/.." && pwd)"
unset _CQ_SCRIPT

export PATH="${HOME}/.cargo/bin:${PATH}"

cqdev() {
  bash "${CURSORQ_ROOT}/scripts/dev-tauri.sh" "$@"
}

cq() {
  cd "${CURSORQ_ROOT}" || return 1
}
