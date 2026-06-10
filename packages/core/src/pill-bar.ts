import type { ProgressPaint } from "./types.js";

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * 胶囊渐变配色：
 * - 蓝/绿：正常状态
 * - 橙色：今日超额但周期余量充足（phase=orange）
 * - 红色：今日超额且周期余量紧张（phase=red）
 */
export function buildPillBarGradient(
  p: Pick<ProgressPaint, "bluePct" | "redPct" | "warnYellowPct" | "phase">
): string {
  const blue = clamp01(p.bluePct);
  const intensity = clamp01(p.redPct);

  // 正常状态：绿→蓝渐变
  if (intensity <= 0.02) {
    const greenEnd = (1 - blue) * 100;
    return `linear-gradient(90deg,#16a34a 0%,#4ade80 ${Math.max(0, greenEnd - 2)}%,#7dd3fc ${greenEnd + 4}%,#2563eb 100%)`;
  }

  // 橙色：今日猛但周期余粮充足，温和的琥珀色渐变
  if (p.phase === "orange") {
    const oEnd = Math.min(55, Math.max(20, intensity * 60));
    const gEnd = Math.min(90, oEnd + 16);
    return `linear-gradient(90deg,#d97706 0%,#f59e0b ${Math.round(oEnd * 0.5)}%,#fbbf24 ${Math.round(oEnd)}%,#4ade80 ${Math.round(gEnd)}%,#16a34a 100%)`;
  }

  // 红色：周期也紧张，深红渐变
  const rEnd = Math.min(58, Math.max(22, intensity * 48));
  const gEnd = Math.min(92, rEnd + 14);
  return `linear-gradient(90deg,#9a3412 0%,#c2410c ${Math.round(rEnd * 0.45)}%,#ea580c ${Math.round(rEnd)}%,#4ade80 ${Math.round(gEnd)}%,#16a34a 100%)`;
}
