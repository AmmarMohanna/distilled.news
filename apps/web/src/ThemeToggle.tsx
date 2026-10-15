import { useEffect, useState } from "react";
import { useLanguage } from "./LanguageControl";
import { Moon, Sun } from "lucide-react";

const THEME_EVENT = "dn-theme";
const readTheme = () => localStorage.getItem("dn_theme") === "dark" ? "dark" : "light";

/** Shared by the header button and the Settings switch so both stay in step. */
export function useTheme() {
  const [theme, setThemeState] = useState<"dark" | "light">(readTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("dn_theme", theme);
  }, [theme]);
  useEffect(() => {
    const sync = () => setThemeState(readTheme());
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);
  const setTheme = (next: "dark" | "light") => {
    localStorage.setItem("dn_theme", next);
    setThemeState(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  };
  return { theme, setTheme };
}

export function ThemeToggle() {
  const { t } = useLanguage();
  const { theme, setTheme } = useTheme();
  return <><svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true"><defs>
    <filter id="globe-transparent" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -3 -3 -3 0 8.55" result="keyedGlobe"/>
      <feComposite in="keyedGlobe" in2="SourceAlpha" operator="in"/>
    </filter>
  </defs></svg><button type="button" className="icon-button theme-toggle" aria-label={t(theme === "dark" ? "Switch to light mode" : "Switch to dark mode")} title={t(theme === "dark" ? "Switch to light mode" : "Switch to dark mode")} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
    {theme === "dark" ? <Sun size={20} aria-hidden/> : <Moon size={20} aria-hidden/>}
  </button></>;
}
