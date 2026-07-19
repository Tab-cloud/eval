"use client";

import { useState } from "react";

export type Theme = "dark" | "light";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark");
  const setTheme = (next: Theme) => {
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    localStorage.setItem("luban-theme", next);
    setThemeState(next);
  };
  return { theme, toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark") };
}
