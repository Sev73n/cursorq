import fs from "node:fs";
import path from "node:path";
import type { AppState } from "./types.js";

const DEFAULT_STATE: AppState = {
  surplusBankCents: 0,
  snapshots: [],
};

export function loadAppState(dataDir: string): AppState {
  const file = path.join(dataDir, "app-state.json");
  if (!fs.existsSync(file)) return { ...DEFAULT_STATE };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as AppState;
    return {
      surplusBankCents: raw.surplusBankCents ?? 0,
      snapshots: raw.snapshots ?? [],
      lastSettleDate: raw.lastSettleDate,
      lastNotify: raw.lastNotify,
      locale: raw.locale === "en" ? "en" : "zh",
      jokeIndex: raw.jokeIndex,
      lastIncludedSpend: raw.lastIncludedSpend,
      lastIncludedDate: raw.lastIncludedDate,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

const PREF_KEYS = ["alwaysOnTop", "launchAtStartup"] as const;

export function saveAppState(dataDir: string, state: AppState): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, "app-state.json");
  let prefs: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
        string,
        unknown
      >;
      for (const k of PREF_KEYS) {
        if (raw[k] !== undefined) prefs[k] = raw[k];
      }
    } catch {
      prefs = {};
    }
  }
  fs.writeFileSync(
    file,
    JSON.stringify({ ...prefs, ...state }, null, 2),
    "utf8"
  );
}
