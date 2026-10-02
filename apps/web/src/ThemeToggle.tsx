import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [theme, setTheme] = useState(() => localStorage.getItem("dn_theme") === "dark" ? "dark" : "light");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("dn_theme", theme);
  }, [theme]);
  return <><svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true"><defs>
    <filter id="globe-transparent" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -3 -3 -3 0 8.55" result="keyedGlobe"/>
      <feComposite in="keyedGlobe" in2="SourceAlpha" operator="in"/>
    </filter>
  </defs></svg><button type="button" className="icon-button theme-toggle" aria-label={`switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
    {theme === "dark" ? <Sun size={20} aria-hidden/> : <Moon size={20} aria-hidden/>}
  </button></>;
}
