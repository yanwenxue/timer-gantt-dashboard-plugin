import { useEffect, useState } from "react";
import { setLanguage, useLanguage } from "./i18n";

export function useHostAppearance(preview: boolean) {
  const language = useLanguage();
  const [dark, setDark] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
    if (preview) { setLanguage(navigator.language); setReady(true); return; }
    let active = true;
    let changed = false;
    let off: (() => void) | undefined;
    void import("@lark-base-open/js-sdk").then(async ({ bridge, dashboard, DashboardState }) => {
      if (!active) return;
      const full = dashboard.state === DashboardState.FullScreen;
      setFullScreen(full);
      setDark(full);
      await Promise.allSettled([
        Promise.resolve().then(() => {
          off = bridge.onThemeChange(({ data }) => {
            changed = true;
            if (active) setDark(full || data.theme === "DARK");
          });
        }),
        Promise.resolve().then(() => bridge.getTheme()).then(theme => { if (active && !changed) setDark(full || theme === "DARK"); }),
        Promise.resolve().then(() => bridge.getLanguage()).then(value => { if (active) setLanguage(value); })
      ]);
    }).catch(() => {}).finally(() => { if (active) setReady(true); });
    return () => { active = false; off?.(); };
  }, [preview]);
  return { language, dark, fullScreen, ready };
}
