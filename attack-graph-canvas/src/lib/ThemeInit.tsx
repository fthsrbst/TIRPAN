import { useEffect } from "react";

const THEME_KEY = "tirpan_theme";

export const ThemeInit = () => {
  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      const theme = saved === "light" || saved === "dark" ? saved : "dark";
      document.documentElement.classList.remove("dark", "light");
      document.documentElement.classList.add(theme);
    } catch {}
  }, []);
  return null;
};
