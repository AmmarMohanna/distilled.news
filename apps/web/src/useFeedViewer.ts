import { useEffect, useState } from 'react';
import type { BriefingConfig } from '@distilled/core';
import { getBriefings, getSession } from './api';
import type { AccountRecord } from './types';

// Resolve the session and owner controls together so the header has one layout.
export function useFeedViewer(username: string, slug: string) {
  const key = JSON.stringify([username, slug]);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountRecord | null>(null);
  const [ownedFeed, setOwnedFeed] = useState<BriefingConfig | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      let nextAccount: AccountRecord | null = null;
      let nextFeed: BriefingConfig | null = null;
      try {
        const session = await getSession();
        nextAccount = session.authenticated ? session.account ?? null : null;
        if (nextAccount?.username === username) {
          const feeds = await getBriefings();
          nextFeed = feeds.find(feed => feed.slug === slug) ?? null;
        }
      } catch {
        // A failed owner lookup must not discard a successfully resolved session.
      }
      if (!active) return;
      setAccount(nextAccount);
      setOwnedFeed(nextFeed);
      setResolvedKey(key);
    }
    void load();
    return () => { active = false; };
  }, [key, username, slug]);
  return { account, setAccount, ownedFeed, setOwnedFeed, loading: resolvedKey !== key };
}
