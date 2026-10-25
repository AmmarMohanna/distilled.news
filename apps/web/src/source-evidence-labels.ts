export function sourceEvidenceLabels(entry: {headline?: string; sourceTitle: string; sourceUrl?: string; links: string[]}) {
  const headline = entry.headline?.trim() || entry.sourceTitle.trim();
  let publisher = entry.sourceTitle.trim();
  for (const input of [entry.sourceUrl, ...entry.links]) {
    if (!input) continue;
    try {
      const url = new URL(input);
      if (!['https:', 'http:'].includes(url.protocol)) continue;
      publisher = url.hostname.replace(/^www\./, '');
      break;
    } catch { /* A legacy malformed URL must not break the source popup. */ }
  }
  return {headline, publisher};
}
