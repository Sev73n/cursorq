/**
 * 透明窗在 WebView/DOM/托盘 任何变动后都可能露出白边；统一由此模块修复，禁止各处各自 resize±1。
 */
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export const CHROME_WIN_W = 200;
export const CHROME_PILL_RADIUS = 22;
const PILL_H = 44;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let stabilizeChain: Promise<void> = Promise.resolve();
let readState: (() => { logicalH: number; expanded: boolean }) | null = null;

export function bindWindowChromeState(
  getter: () => { logicalH: number; expanded: boolean }
) {
  readState = getter;
}

function currentChromeState(): { logicalH: number; expanded: boolean } {
  if (!readState) {
    throw new Error("bindWindowChromeState() must run before stabilizeWindowChrome()");
  }
  return readState();
}

export async function isCapsuleWindowVisible(): Promise<boolean> {
  try {
    return await getCurrentWindow().isVisible();
  } catch {
    return false;
  }
}

/** 去抖：DOM/刷新/菜单 等连续变更只修一次 */
export function queueStabilizeWindowChrome(delayMs = 40) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void stabilizeWindowChrome();
  }, delayMs);
}

/** DWM + 圆角 HRGN；不做 setSize±1，避免闪白框 */
export async function stabilizeWindowChrome(): Promise<void> {
  stabilizeChain = stabilizeChain.then(() => stabilizeWindowChromeNow());
  await stabilizeChain;
}

async function stabilizeWindowChromeNow(): Promise<void> {
  if (!readState || !(await isCapsuleWindowVisible())) return;

  const { logicalH, expanded } = currentChromeState();
  const h = Math.max(PILL_H, Math.round(logicalH));
  const capsuleOnly = !expanded || h <= PILL_H + 4;
  const win = getCurrentWindow();
  await win.setShadow(false);

  const apply = async () => {
    try {
      await invoke("tune_window_dwm");
      await invoke("sync_window_shape", {
        logicalW: CHROME_WIN_W,
        logicalH: h,
        radius: CHROME_PILL_RADIUS,
        capsuleOnly,
      });
    } catch {
      /* non-Windows */
    }
  };

  await apply();
  await rafTimes(3);
  await apply();
}

function rafTimes(n: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

/** 任意 DOM 变更后自动修复（兜底） */
export function installWindowChromeGuard() {
  const obs = new MutationObserver(() => queueStabilizeWindowChrome(56));
  obs.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style"],
  });
}
