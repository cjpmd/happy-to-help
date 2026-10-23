// Light/dark theme preference (docs/DESIGN.md: light is the default, dark is
// optional). Saved in this browser for now; 1c moves it to user_preferences.

export type ThemePref = "light" | "dark" | "system";
export type Theme = "light" | "dark";

export const THEME_KEY = "gumption-theme";
export const DEFAULT_THEME: ThemePref = "light";
const PREFS: ThemePref[] = ["light", "dark", "system"];

export const isThemePref = (v: unknown): v is ThemePref => PREFS.includes(v as ThemePref);

/** The theme to show for a preference, given whether the system prefers dark. */
export const resolveTheme = (pref: ThemePref, systemDark: boolean): Theme =>
  pref === "system" ? (systemDark ? "dark" : "light") : pref;

/** The saved preference, or the default if none is saved or storage is blocked. */
export function readThemePref(storage: Pick<Storage, "getItem"> | undefined): ThemePref {
  try {
    const saved = storage?.getItem(THEME_KEY);
    return isThemePref(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Puts the theme on <html>: the .dark class and the browser's color-scheme. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement) {
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/**
 * Runs in <head> before the page draws, so a dark preference never flashes
 * light first. Kept small and dependency-free: it mirrors readThemePref,
 * resolveTheme and applyTheme above.
 */
export const themeScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});if(p!=="light"&&p!=="dark"&&p!=="system")p=${JSON.stringify(
  DEFAULT_THEME,
)};var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}})();`;
