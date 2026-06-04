import type { ProgressPaint, WidgetCopy, WidgetState } from "./types.js";

/** Display width: CJK=1, other≈0.5, emoji/kao≈1 */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code > 0x2e7f || (code >= 0x4e00 && code <= 0x9fff)) w += 1;
    else if (/\s/.test(ch)) w += 0;
    else w += 0.5;
    if (w > 10) return w;
  }
  return w;
}

export function validateCopy(line1: string, line2: string): boolean {
  return displayWidth(line1) <= 10 && displayWidth(line2) <= 10;
}

export interface JokeEntry {
  line1: string;
  line2: string;
  tag: string;
}

export interface StateEntry {
  line1: string;
  line2: string;
  state: WidgetState;
}

export function pickWidgetState(p: ProgressPaint): WidgetState {
  if (p.bluePct > 0.5) return "surplus_vibe";
  if (p.phase === "red") return "done_today";
  if (p.warnYellowPct > 0.05) return "warn80";
  if (p.cycleRemainingCents < p.cycleLimitCents * 0.15) return "over_cycle";
  return "idle";
}

export function selectCopy(
  jokes: JokeEntry[],
  states: StateEntry[],
  widgetState: WidgetState,
  lastIndex: number
): { copy: WidgetCopy; index: number } {
  const pool =
    widgetState !== "idle"
      ? states.filter((s) => s.state === widgetState)
      : jokes;

  if (pool.length === 0) {
    return {
      copy: { line1: "连接中", line2: "…", state: widgetState },
      index: lastIndex,
    };
  }

  let idx = (lastIndex + 1) % pool.length;
  for (let i = 0; i < pool.length; i++) {
    const item = pool[idx]!;
    const line1 = "line1" in item ? item.line1 : "";
    const line2 = "line2" in item ? item.line2 : "";
    if (validateCopy(line1, line2)) {
      return {
        copy: { line1, line2, state: widgetState },
        index: idx,
      };
    }
    idx = (idx + 1) % pool.length;
  }

  return {
    copy: { line1: "(￣▽￣)", line2: "稳", state: widgetState },
    index: idx,
  };
}
