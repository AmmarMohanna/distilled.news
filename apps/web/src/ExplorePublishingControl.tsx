import { useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { setExploreFeed } from "./api";
import { useLanguage } from "./LanguageControl";

export const EXPLORE_CHANGED_EVENT = "dn-explore-changed";

export function ExplorePublishingControl({ feedId, featured, onError }: {
  feedId: string; featured?: boolean; onError: (message: string) => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(Boolean(featured));
  useEffect(() => setSelected(Boolean(featured)), [featured]);
  return <button type="button" disabled={busy} aria-pressed={selected} onClick={async () => {
    setBusy(true);
    try {
      await setExploreFeed(feedId, !selected);
      setSelected(!selected);
      window.dispatchEvent(new Event(EXPLORE_CHANGED_EVENT));
    } catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }}><Compass size={16}/>{t(selected ? "Remove from Explore" : "Publish to Explore")}</button>;
}
