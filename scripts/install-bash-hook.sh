#!/usr/bin/env bash
# 把 CursorQ 快捷命令写入 ~/.bashrc（可重复执行，不会重复插入）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BASHRC="${HOME}/.bashrc"
MARK_BEGIN="# >>> cursorq >>>"
MARK_END="# <<< cursorq <<<"

if [[ ! -f "${BASHRC}" ]]; then
  touch "${BASHRC}"
fi

if grep -qF "${MARK_BEGIN}" "${BASHRC}" 2>/dev/null; then
  echo "[cursorq] 已在 ${BASHRC} 中配置，跳过。"
else
  # Git Bash 路径：尽量用 pwd -W，否则保留 Unix 风格
  if ROOT_WIN="$(cd "${ROOT}" && pwd -W 2>/dev/null)"; then
    ENV_PATH="${ROOT_WIN//\\//}/scripts/bash-env.sh"
  else
    ENV_PATH="${ROOT}/scripts/bash-env.sh"
  fi

  cat >>"${BASHRC}" <<EOF

${MARK_BEGIN}
export PATH="\${HOME}/.cargo/bin:\${PATH}"
[[ -f "${ENV_PATH}" ]] && source "${ENV_PATH}"
${MARK_END}
EOF
  echo "[cursorq] 已写入 ${BASHRC}"
fi

echo ""
echo "请执行:  source ~/.bashrc"
echo "之后可用:"
echo "  cqdev     # 启动 Tauri 开发"
echo "  cq        # cd 到项目根目录"
echo "  npm run dev:bash   # 同上（在项目根）"
