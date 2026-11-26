import { useCallback, useEffect, useState } from 'react';
import type { BriefingConfig } from '@distilled/core';
import { getBriefings, getSession } from './api';
import type { AccountRecord } from './types';

// Resolve the session and owner controls together so the header has one layout.
export function useFeedViewer(username: string, slug: string) {
  const key = JSON.stringify([username, slug]);
  const [attempt,setAttempt]=useState(0);
  const [sessionState,setSessionState]=useState<'unresolved'|'authenticated'|'anonymous'|'error'>('unresolved');
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountRecord | null>(null);
  const [ownedFeed, setOwnedFeed] = useState<BriefingConfig | null>(null);
  const [ownershipState,setOwnershipState]=useState<'loading'|'owner'|'not-owner'|'error'>('loading');
  useEffect(() => {
    let active = true;
    async function load() {
      let nextAccount: AccountRecord | null = null;
      let nextFeed: BriefingConfig | null = null;
      let nextState:typeof sessionState;
      let nextOwnership:typeof ownershipState='not-owner';
      try {
        const session = await getSession();
        if(session.authenticated&&(!session.account||typeof session.account.id!=='string'||!session.account.id))throw Error('Authenticated session missing account identity');
        nextAccount = session.authenticated ? session.account! : null;
        nextState=session.authenticated?'authenticated':'anonymous';
      } catch {
        if(active){setAccount(null);setOwnedFeed(null);setSessionState('error');setOwnershipState('loading');setResolvedKey(key);}
        return; // A failed session lookup is not evidence of anonymity.
      }
      if (nextAccount?.username === username) {
        try {
          const feeds = await getBriefings();
          nextFeed = feeds.find(feed => feed.slug === slug) ?? null;
          nextOwnership=nextFeed?'owner':'not-owner';
        } catch { nextOwnership='error'; }
      }
      if (!active) return;
      setAccount(nextAccount);
      setOwnedFeed(nextFeed);
      setOwnershipState(nextOwnership);
      setSessionState(nextState);
      setResolvedKey(key);
    }
    void load();
    return () => { active = false; };
  }, [key, username, slug, attempt]);
  const retrySession=useCallback(()=>{
    setResolvedKey(null);setSessionState('unresolved');setAccount(null);setOwnedFeed(null);setAttempt(value=>value+1);
  },[]);
  const loading=resolvedKey!==key;
  const retryOwnership=useCallback(()=>{setOwnershipState('loading');setAttempt(value=>value+1);},[]);
  return { account, setAccount, ownedFeed, setOwnedFeed, loading, sessionState:loading?'unresolved' as const:sessionState, retrySession, ownershipState:loading?'loading' as const:ownershipState, retryOwnership };
}
