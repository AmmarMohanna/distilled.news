import { useEffect, useState } from "react";
import { Check, Smartphone, X } from "lucide-react";
import { Dialog } from "./Dialog";
import { useLanguage } from "./LanguageControl";
import { confirmInstalledApp, installApp, notificationsEnabled, setNotificationsEnabled } from "./pwa";

export function NotificationsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  return <Dialog label={t("Notifications")} className="settings-status-dialog" onClose={onClose}><section className="dialog-inner"><button type="button" className="dialog-close" aria-label={t("Close dialog")} onClick={onClose}><X size={22}/></button><h2>{t("Notifications")}</h2><p role="status">{t("Notifications are not enabled on this deployment.")}</p></section></Dialog>;
}

export type InstallStatus = "pending" | Awaited<ReturnType<typeof installApp>> | "error";
export function InstallDialog({ status, error, onInstalled, onClose }: { status: InstallStatus; error?: string; onInstalled: () => void; onClose: () => void }) {
  const { t } = useLanguage();
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, [onInstalled]);
  const successful = confirmed || status === "installed" || status === "already-installed";
  const message = confirmed || status === "already-installed" ? "Already installed" : status === "installed" ? "Installation completed. Check your apps." : status === "cancelled" ? "Installation cancelled" : status === "unavailable" ? "Installation could not start in this browser." : status === "error" ? error || "Could not install the app." : "Installing…";
  return <Dialog label={t("Install App (PWA)")} className="settings-status-dialog install-status-dialog" onClose={onClose}><section className="dialog-inner">
    <button type="button" className="dialog-close" aria-label={t("Close dialog")} onClick={onClose}><X size={22}/></button>
    <span className={`install-status-icon ${successful ? "success" : ""}`} aria-hidden="true">{successful ? <Check size={32}/> : <Smartphone size={32}/>}</span>
    <h2>{t("Install App (PWA)")}</h2><p role="status">{t(message)}</p>
    {status === "unavailable" && !confirmed && <button type="button" className="primary-button" onClick={() => { confirmInstalledApp(); setConfirmed(true); }}>{t("Already installed on this device")}</button>}
  </section></Dialog>;
}
