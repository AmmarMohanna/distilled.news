import { useEffect } from "react";
import { Check, Smartphone, X } from "lucide-react";
import { Dialog } from "./Dialog";
import { useLanguage } from "./LanguageControl";
import { installApp } from "./pwa";

export type InstallStatus = "pending" | Awaited<ReturnType<typeof installApp>> | "error";
export function InstallDialog({ status, error, onInstalled, onClose }: { status: InstallStatus; error?: string; onInstalled: () => void; onClose: () => void }) {
  const { t } = useLanguage();
  useEffect(() => {
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, [onInstalled]);
  const successful = status === "installed" || status === "already-installed";
  const message = status === "already-installed" ? "Already installed" : status === "installed" ? "Installation completed. Check your apps." : status === "cancelled" ? "Installation cancelled" : status === "ios-instructions" ? "In Safari, tap Share, then Add to Home Screen. In Chrome on iPhone, use Share, then Add to Home Screen." : status === "android-instructions" ? "Open your browser menu and choose Install app or Add to Home screen." : status === "unavailable" ? "This browser cannot offer installation right now. If the app is installed, open it from your apps." : status === "error" ? error || "Could not install the app." : "Installing…";
  return <Dialog label={t("Install app")} className="settings-status-dialog install-status-dialog" onClose={onClose}><section className="dialog-inner">
    <button type="button" className="dialog-close" aria-label={t("Close dialog")} onClick={onClose}><X size={22}/></button>
    <span className={`install-status-icon ${successful ? "success" : ""}`} aria-hidden="true">{successful ? <Check size={32}/> : <Smartphone size={32}/>}</span>
    <h2>{t("Install app")}</h2><p role="status">{t(message)}</p>
  </section></Dialog>;
}
