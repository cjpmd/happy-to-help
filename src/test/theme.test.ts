import { describe, expect, it } from "vitest";
import { THEME_KEY, applyTheme, readThemePref, resolveTheme, themeScript } from "@/lib/theme";

const storage = (value: string | null) => ({ getItem: () => value });

describe("theme preference", () => {
  it("defaults to light", () => {
    expect(readThemePref(undefined)).toBe("light");
    expect(readThemePref(storage(null))).toBe("light");
    expect(readThemePref(storage("purple"))).toBe("light");
  });

  it("reads a saved preference", () => {
    expect(readThemePref(storage("dark"))).toBe("dark");
    expect(readThemePref(storage("system"))).toBe("system");
  });

  it("falls back to light when storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(readThemePref(blocked)).toBe("light");
  });

  it("matches the system only when asked to", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("puts the theme on the root element", () => {
    const root = document.createElement("html");
    applyTheme("dark", root);
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.colorScheme).toBe("dark");
    applyTheme("light", root);
    expect(root.classList.contains("dark")).toBe(false);
  });

  it("applies the saved theme before the page draws", () => {
    localStorage.setItem(THEME_KEY, "dark");
    document.documentElement.classList.remove("dark");
    new Function(themeScript)();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    localStorage.setItem(THEME_KEY, "nonsense");
    new Function(themeScript)();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    localStorage.removeItem(THEME_KEY);
  });
});
