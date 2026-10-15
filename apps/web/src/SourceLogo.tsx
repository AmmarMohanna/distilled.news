import { useState } from 'react';
import { Globe } from 'lucide-react';

export function sourceLogoDomain(source: string): string | undefined {
  if (/^mtv(?:\s+lebanon)?$/i.test(source.trim())) return 'mtv.com.lb';
  const embedded = source.match(/https?:\/\/[^\s)]+/i)?.[0];
  if (embedded) source = embedded;
  try {
    const url = new URL(source.includes('://') ? source : `https://${source}`);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !host.includes('.') || /[:\s]/.test(host)) return;
    return host;
  } catch { return; }
}

export function SourceLogo({ source }: { source: string }) {
  const domain = sourceLogoDomain(source);
  const [failedDomain, setFailedDomain] = useState<string>();
  return domain && failedDomain !== domain
    ? <img className="source-logo" src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedDomain(domain)}/>
    : <Globe size={23}/>;
}
