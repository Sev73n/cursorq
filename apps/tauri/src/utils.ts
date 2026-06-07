export function daysUrgencyPct(daysLeftPct: number): number {
  return Math.min(100, Math.max(0, Math.round(100 - daysLeftPct)));
}

export function daysUrgencyTone(urgencyPct: number): string {
  if (urgencyPct < 34) return "days-calm";
  if (urgencyPct < 67) return "days-mid";
  return "days-urgent";
}