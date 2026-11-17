import {toUiError, type UiMessage} from './api-errors';
import { useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { setExploreFeed } from "./api";
import { useLanguage } from "./LanguageControl";
import {EXPLORE_CHANGED_EVENT} from './explore-events';
export {EXPLORE_CHANGED_EVENT} from './explore-events';

export function ExplorePublishingControl({ feedId, featured, onError }: {
  feedId: string; featured?: boolean; onError: (message: UiMessage) => void;
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
    } catch (cause) { onError(toUiError(cause)); }
    finally { setBusy(false); }
  }}><Compass size={16}/>{t(selected ? "Remove from Explore" : "Publish to Explore")}</button>;
}
