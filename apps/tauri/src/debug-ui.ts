import type { ProgressPaint } from "@cursorq/core";
import { t, type Locale } from "./i18n.js";
import {
  DEBUG_TODAY_RATIO_MAX,
  daysUrgencyTone,
  formatDaysLeftLabel,
  mockFromSliders,
  todayBarWidthPct,
  type DebugScenarioId,
  type DebugSliders,
} from "./debug-mode.js";
import { formatTodayMetricValue } from "./debug-ui-format.js";

export type DebugPaintFn = (p: ProgressPaint) => void;

export {
  formatTodayMetricValue,
  formatTotalMetricValue,
} from "./debug-ui-format.js";

function metricDebugRow(
  label: string,
  value: string,
  barPct: number,
  sliderVal: number,
  fillClass: string,
  key: "cycle" | "today" | "days",
  sliderMax = 100
): string {
  const w = Math.min(100, Math.max(0, barPct));
  const sv = Math.min(sliderMax, Math.max(0, sliderVal));
  return `
    <div class="metric metric--debug" data-metric="${key}">
      <div class="metric-head">
        <span class="metric-label">${label}</span>
        <span class="metric-val" data-val="${key}">${value}</span>
      </div>
      <div class="metric-track metric-track--debug">
        <div class="metric-fill ${fillClass}" data-fill="${key}" style="width:${w}%"></div>
        <input
          type="range"
          class="metric-slider"
          data-slider="${key}"
          min="0"
          max="${sliderMax}"
          step="1"
          value="${sv}"
          aria-label="${label}"
        />
      </div>
    </div>`;
}

const PRESET_IDS: DebugScenarioId[] = ["holiday", "doneToday", "overPace"];

function presetLabel(locale: Locale, id: DebugScenarioId): string {
  const key =
    id === "holiday"
      ? "debugPresetHoliday"
      : id === "doneToday"
        ? "debugPresetDone"
        : "debugPresetOver";
  return t(locale, key);
}

function syncDebugRow(
  box: HTMLElement,
  key: "cycle" | "today" | "days",
  barPct: number,
  sliderValue: number,
  fillClass?: string
) {
  const w = Math.min(100, Math.max(0, barPct));
  const fill = box.querySelector(`[data-fill="${key}"]`) as HTMLElement | null;
  const rng = box.querySelector(
    `[data-slider="${key}"]`
  ) as HTMLInputElement | null;
  if (fill) {
    fill.style.width = `${w}%`;
    if (fillClass) fill.className = `metric-fill ${fillClass}`;
  }
  if (rng) rng.value = String(sliderValue);
}

function syncDebugLabels(
  box: HTMLElement,
  locale: Locale,
  tierLabel: string,
  sliders: DebugSliders,
  p: ProgressPaint,
  todayRatioPct: number
) {
  const cycleVal = box.querySelector('[data-val="cycle"]');
  const todayVal = box.querySelector('[data-val="today"]');
  const daysVal = box.querySelector('[data-val="days"]');
  if (cycleVal) {
    cycleVal.textContent = `${tierLabel} · ${Math.round(sliders.cycleUsedPct)}%`;
  }
  if (todayVal) {
    todayVal.textContent = `${Math.round(todayRatioPct)}% · ${formatTodayMetricValue(
      locale,
      p.todayUsedCents,
      p.dailyBudgetCents
    )}`;
  }
  if (daysVal) {
    daysVal.textContent = formatDaysLeftLabel(locale, p.daysLeft);
  }
}

export function renderDebugMetrics(
  box: HTMLElement,
  locale: Locale,
  sliders: DebugSliders,
  tierLabel: string,
  tierTone: string,
  onPaint: DebugPaintFn
): void {
  const { progress: p, todayRatioPct } = mockFromSliders(sliders);

  box.innerHTML = [
    metricDebugRow(
      t(locale, "total"),
      `${tierLabel} · ${Math.round(sliders.cycleUsedPct)}%`,
      sliders.cycleUsedPct,
      sliders.cycleUsedPct,
      tierTone,
      "cycle",
      100
    ),
    metricDebugRow(
      t(locale, "today"),
      `${Math.round(todayRatioPct)}% · ${formatTodayMetricValue(locale, p.todayUsedCents, p.dailyBudgetCents)}`,
      todayBarWidthPct(todayRatioPct),
      sliders.todayRatioPct,
      "green",
      "today",
      DEBUG_TODAY_RATIO_MAX
    ),
    metricDebugRow(
      t(locale, "daysLeft"),
      formatDaysLeftLabel(locale, p.daysLeft),
      sliders.daysUrgencyPct,
      sliders.daysUrgencyPct,
      daysUrgencyTone(sliders.daysUrgencyPct),
      "days",
      100
    ),
    `<p class="debug-pill-hint">${t(locale, "debugPillHint")}</p>`,
  ].join("");

  const apply = () => {
    const { progress: prog, todayRatioPct: ratioPct } = mockFromSliders(sliders);
    syncDebugRow(box, "cycle", sliders.cycleUsedPct, sliders.cycleUsedPct, tierTone);
    syncDebugRow(
      box,
      "today",
      todayBarWidthPct(ratioPct),
      Math.min(DEBUG_TODAY_RATIO_MAX, sliders.todayRatioPct),
      "green"
    );
    syncDebugRow(
      box,
      "days",
      sliders.daysUrgencyPct,
      sliders.daysUrgencyPct,
      daysUrgencyTone(sliders.daysUrgencyPct)
    );
    syncDebugLabels(box, locale, tierLabel, sliders, prog, ratioPct);
    onPaint(prog);
  };

  box.querySelectorAll<HTMLInputElement>(".metric-slider").forEach((rng) => {
    rng.addEventListener("input", () => {
      const key = rng.dataset.slider as "cycle" | "today" | "days";
      const v = Number(rng.value);
      if (key === "cycle") sliders.cycleUsedPct = v;
      else if (key === "today") sliders.todayRatioPct = v;
      else sliders.daysUrgencyPct = v;
      apply();
    });
  });

  apply();
}

export function renderDebugToolbar(
  toolbar: HTMLElement,
  locale: Locale,
  onPreset: (id: DebugScenarioId) => void,
  onExit: () => void
): void {
  toolbar.hidden = false;
  toolbar.innerHTML = `
    <div class="debug-presets" role="group" aria-label="${t(locale, "debugPresets")}">
      ${PRESET_IDS.map(
        (id) =>
          `<button type="button" class="debug-preset-btn" data-preset="${id}">${presetLabel(locale, id)}</button>`
      ).join("")}
    </div>
    <button type="button" class="debug-exit-btn" id="debugExitBtn">${t(locale, "debugExit")}</button>
  `;

  toolbar.querySelectorAll<HTMLButtonElement>("[data-preset]").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      onPreset(btn.dataset.preset as DebugScenarioId);
    });
  });
  toolbar.querySelector("#debugExitBtn")?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    onExit();
  });
}

export function clearDebugToolbar(toolbar: HTMLElement | null): void {
  if (!toolbar) return;
  toolbar.hidden = true;
  toolbar.innerHTML = "";
}
