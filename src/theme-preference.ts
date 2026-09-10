import { defaultThemeColor, isThemeColor } from "./theme";

type ThemeStorage = Pick<Storage, "getItem" | "setItem">;
type StorageProvider = () => ThemeStorage;
export type ThemePreference = {
  color: string;
  source: "default" | "dashboard" | "local";
  persistence: "none" | "saved" | "unavailable";
};

const storageKey = "timer-gantt-theme-color";
const browserStorage: StorageProvider = () => window.localStorage;

export function loadThemePreference(storage: StorageProvider = browserStorage): ThemePreference {
  try {
    const color = storage().getItem(storageKey);
    if (isThemeColor(color)) return { color, source: "local", persistence: "saved" };
  } catch {
    return { color: defaultThemeColor, source: "default", persistence: "unavailable" };
  }
  return { color: defaultThemeColor, source: "default", persistence: "none" };
}

export function selectThemeColor(color: string, storage: StorageProvider = browserStorage): ThemePreference {
  if (!isThemeColor(color)) throw new Error("Invalid theme color");
  let persistence: ThemePreference["persistence"] = "unavailable";
  try {
    const target = storage();
    target.setItem(storageKey, color);
    if (target.getItem(storageKey) === color) persistence = "saved";
  } catch {
    // Keep the selection for this visit, but do not claim it survives a reload.
  }
  return { color, source: "local", persistence };
}

export function applyDashboardTheme(current: ThemePreference, color: unknown): ThemePreference {
  // A saved or newly chosen personal color takes precedence over late dashboard configuration.
  if (current.source === "local" || !isThemeColor(color)) return current;
  return { ...current, color, source: "dashboard" };
}
