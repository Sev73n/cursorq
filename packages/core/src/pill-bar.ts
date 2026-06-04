import type { ProgressPaint } from "./types.js";

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** 胶囊渐变：仅今日超额 ≥2 日日预算时出现红色，其余为绿/蓝 */
export function buildPillBarGradient(
  p: Pick<ProgressPaint, "bluePct" | "redPct" | "warnYellowPct">
): string {
  const blue = clamp01(p.bluePct);
  const red = clamp01(p.redPct);

  if (red <= 0.02) {
    const greenEnd = (1 - blue) * 100;
    return `linear-gradient(90deg,#16a34a 0%,#4ade80 ${Math.max(0, greenEnd - 2)}%,#7dd3fc ${greenEnd + 4}%,#2563eb 100%)`;
  }

  const rEnd = Math.min(58, Math.max(22, red * 48));
  const gEnd = Math.min(92, rEnd + 14);
  return `linear-gradient(90deg,#9a3412 0%,#c2410c ${Math.round(rEnd * 0.45)}%,#ea580c ${Math.round(rEnd)}%,#4ade80 ${Math.round(gEnd)}%,#16a34a 100%)`;
}
