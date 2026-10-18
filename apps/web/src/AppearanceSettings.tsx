import { useState } from "react";
import { Globe, Moon, Settings, X } from "lucide-react";
import { Dialog } from "./Dialog";
import { languageNames, setWebsiteLanguage, useLanguage } from "./LanguageControl";
import { useTheme } from "./ThemeToggle";

export function AppearanceSettings() {
  const [open, setOpen] = useState(false);
  const { language, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  return <><button className="mobile-appearance-settings icon-button" type="button" aria-label={t("Settings")} onClick={() => setOpen(true)}><Settings size={20}/></button>
    {open && <Dialog label={t("Settings")} className="appearance-settings-dialog" onClose={() => setOpen(false)}><section className="dialog-inner">
      <button className="dialog-close" type="button" aria-label={t("Close dialog")} onClick={() => setOpen(false)}><X size={22}/></button>
      <h2>{t("Settings")}</h2>
      <div className="setting-row setting-language" role="group" aria-label={t("Language")}><Globe/><span>{t("Language")}</span><span className="language-segments">{(["en", "fr", "ar"] as const).map(code => <button key={code} type="button" lang={code} aria-pressed={language === code} onClick={() => setWebsiteLanguage(code)}>{languageNames[code]}</button>)}</span></div>
      <button className="setting-row" type="button" role="switch" aria-label={t("Dark mode")} aria-checked={theme === "dark"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><Moon/><span>{t("Dark mode")}</span><span>{theme === "dark" ? t("On") : t("Off")}</span></button>
    </section></Dialog>}
  </>;
}
