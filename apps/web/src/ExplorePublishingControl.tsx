import { useState } from "react";
import { Compass } from "lucide-react";
import { setExploreFeed } from "./api";
import { useLanguage } from "./LanguageControl";

export const EXPLORE_CHANGED_EVENT = "dn-explore-changed";

export function ExplorePublishingControl({ feedId, featured, onError }: {
  feedId: string; featured?: boolean; onError: (message: string) => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  return <button type="button" disabled={busy || featured === undefined} aria-pressed={featured ?? false} onClick={async () => {
    setBusy(true);
    try {
      await setExploreFeed(feedId, !featured);
      window.dispatchEvent(new Event(EXPLORE_CHANGED_EVENT));
    } catch (cause) { onError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }}><Compass size={16}/>{t(featured ? "Remove from Explore" : "Publish to Explore")}</button>;
}
