"use client";

import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

export function useTheme() {
  // The server and the first client render both use dark. The inline bootstrap
  // script may already have selected light, so reconcile after hydration.
  const [theme, setThemeState] = useState<Theme>("dark");
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setThemeState(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const setTheme = (next: Theme) => {
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    localStorage.setItem("luban-theme", next);
    setThemeState(next);
  };
  return { theme, toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark") };
}
