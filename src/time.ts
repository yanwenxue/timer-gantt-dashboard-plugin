import { getLanguage, t } from "./i18n";
import type { TimerRun, TimeWindow, TimeRange } from "./types";
export const hourMs = 60 * 60 * 1000;
export const dayMs = 24 * hourMs;
export const axisPaddingMs = 30 * 60 * 1000;
export const timeWindowOptions: Array<{ key: TimeWindow; label: string }> = [
  { key: "today", label: "今天" },
  { key: "3d", label: "最近3天" },
  { key: "7d", label: "最近7天" },
  { key: "all", label: "全部" },
  { key: "custom", label: "自选" }
];

/** Compatibility parser for demo/legacy strings; live data uses raw milliseconds. */
export function parseTime(value: string | number): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (!value.trim()) return NaN;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.abs(numeric) > 100000000000 ? numeric : numeric * 1000;
  // Preserve ISO offsets; only normalize the legacy local date-time separator.
  const parsed = new Date(value.replace(/^(\d{4})-(\d{2})-(\d{2}) /, "$1-$2-$3T")).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function formatTime(ms: number): string {
  return new Intl.DateTimeFormat(getLanguage(), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date(ms));
}

export function formatAxisLabel(ms: number): string {
  const date = new Date(ms);
  const range = new Intl.DateTimeFormat(getLanguage(), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
  return range.replace(" ", "\n");
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Number(seconds.toFixed(3))} ${t("秒")}`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h ? `${h} ${t("小时")}` : "", m ? `${m} ${t("分")}` : "", s ? `${s} ${t("秒")}` : ""].filter(Boolean).join(" ");
}

export function byStartTime(a: TimerRun, b: TimerRun) {
  return parseTime(a.start) - parseTime(b.start);
}

/** Iterate instead of expanding records into function arguments (large tables can exceed engine limits). */
export function getRunBounds(runs: TimerRun[]): [number | undefined, number | undefined] {
  if (!runs.length) return [undefined, undefined];
  let min = runs[0].start;
  let max = runs[0].end;
  for (const run of runs) {
    min = Math.min(min, run.start);
    max = Math.max(max, run.end);
  }
  return [min, max];
}

export function getTodayInputRange(): TimeRange {
  const [start, end] = getTimeWindowBounds("today");
  return {
    start: toDateTimeLocalValue(start),
    end: toDateTimeLocalValue(end)
  };
}

export function toDateTimeLocalValue(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    "-",
    pad(date.getMonth() + 1),
    "-",
    pad(date.getDate()),
    "T",
    pad(date.getHours()),
    ":",
    pad(date.getMinutes()),
    ":",
    pad(date.getSeconds())
  ].join("");
}

export function parseDateTimeLocal(value: string): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

export function isValidTimeRange(range: TimeRange): boolean {
  const start = parseDateTimeLocal(range.start);
  const end = parseDateTimeLocal(range.end);
  return start !== null && end !== null && end > start;
}

export function getTimeWindowBounds(window: TimeWindow, min?: number, max?: number, customRange?: TimeRange, now = Date.now()): [number, number] {
  if (window === "all") {
    return [min ?? now - dayMs, max ?? now];
  }

  if (window === "custom" && customRange) {
    const customStart = parseDateTimeLocal(customRange.start);
    const customEnd = parseDateTimeLocal(customRange.end);
    return [customStart ?? now, customEnd ?? customStart ?? now];
  }

  if (window === "today") {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const todayEnd = tomorrow.getTime() - 1;
    return [todayStart.getTime(), todayEnd];
  }

  const duration = window === "3d" ? 3 * dayMs : 7 * dayMs;
  return [now - duration, now];
}

export function runOverlapsWindow(run: TimerRun, start: number, end: number): boolean {
  return parseTime(run.start) <= end && parseTime(run.end) >= start;
}

export function getRecordDurationSeconds(start: number, end: number, durationText: string): number {
  if (durationText.trim()) {
    const value = Number(durationText);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  const computed = (end - start) / 1000;
  return Number.isFinite(computed) && computed >= 0 ? computed : 0;
}
