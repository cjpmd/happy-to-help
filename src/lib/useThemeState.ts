import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_THEME,
  THEME_KEY,
  applyTheme,
  isThemePref,
  readThemePref,
  resolveTheme,
  type ThemePref,
} from "./theme";

/**
 * The theme preference, shared by the demo and live stores. The <head> script has already
 * applied the saved theme; this loads the same preference, follows the system while
 * "Match system" is chosen, and saves changes in the browser. `remote` is the signed-in
 * user's saved preference (user_preferences.theme), which wins once it loads.
 */
export function useThemeState(remote?: string | null, onSave?: (pref: ThemePref) => void) {
  const [themePref, setPref] = useState<ThemePref>(DEFAULT_THEME);
  const [systemDark, setSystemDark] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const theme = resolveTheme(themePref, systemDark);

  useEffect(() => {
    setPref(readThemePref(window.localStorage));
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    setLoaded(true);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!isThemePref(remote)) return;
    setPref(remote);
    try {
      window.localStorage.setItem(THEME_KEY, remote);
    } catch {
      /* Storage blocked: the choice lasts until reload. */
    }
  }, [remote]);

  useEffect(() => {
    if (loaded) applyTheme(theme);
  }, [theme, loaded]);

  const setThemePref = useCallback(
    (pref: ThemePref) => {
      setPref(pref);
      try {
        window.localStorage.setItem(THEME_KEY, pref);
      } catch {
        /* Storage blocked: the choice lasts until reload. */
      }
      onSave?.(pref);
    },
    [onSave],
  );

  return useMemo(
    () => ({
      theme,
      themePref,
      setThemePref,
      toggleTheme: () => setThemePref(theme === "light" ? "dark" : "light"),
    }),
    [theme, themePref, setThemePref],
  );
}
