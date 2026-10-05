import { useState } from "react";
import { Compass } from "lucide-react";
import { setExploreFeed } from "./api";
import { useLanguage } from "./LanguageControl";

export const EXPLORE_CHANGED_EVENT = "dn-explore-changed";

export function ExplorePublishingControl({ feedId, featured, onError }: {
  feedId: string; featured?: boolean; onError: (message: string) => void;
}) {
  return null;
}
