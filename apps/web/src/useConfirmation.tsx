import { useEffect, useRef, useState } from "react";
import { Dialog } from "./Dialog";
import { useLanguage } from "./LanguageControl";

export function useConfirmation() {
  const [message, setMessage] = useState<string | null>(null);
  const pending = useRef<((confirmed: boolean) => void) | null>(null);
  const { t } = useLanguage();

  useEffect(() => () => { pending.current?.(false); }, []);

  function answer(confirmed: boolean) {
    const resolve = pending.current;
    pending.current = null;
    setMessage(null);
    resolve?.(confirmed);
  }

  function confirm(nextMessage: string) {
    pending.current?.(false);
    setMessage(nextMessage);
    return new Promise<boolean>(resolve => { pending.current = resolve; });
  }

  const confirmation = message === null ? null : <Dialog label={t("Confirm deletion")} onClose={() => answer(false)}>
    <div className="dialog-inner">
      <h2>{t("Confirm deletion")}</h2>
      <p>{message}</p>
      <div className="experience-dialog-actions">
        <button type="button" autoFocus onClick={() => answer(false)}>{t("Cancel")}</button>
        <button type="button" className="danger-button" onClick={() => answer(true)}>{t("Delete")}</button>
      </div>
    </div>
  </Dialog>;

  return { confirm, confirmation };
}
