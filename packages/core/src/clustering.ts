import type { ClusterCandidate, NormalizedMessage } from "./types";
import { eventTokens, jaccardSimilarity, stableHash } from "./text";

const CLUSTER_THRESHOLD = 0.72;
const CLUSTER_CONTAINMENT_THRESHOLD = 0.75;

export function clusterMessages(messages: NormalizedMessage[]): ClusterCandidate[] {
  const clusters: ClusterCandidate[] = [];

  for (const message of messages) {
    const tokens = eventTokens(message.text);
    const matchingCluster = clusters.find((cluster) => {
      const tokenScore = jaccardSimilarity(cluster.tokens, tokens);
      const containmentScore = tokenContainment(cluster.tokens, tokens);
      const sharedLink = message.links.some((link) => {
        const eventLink = eventSpecificLink(link);
        return Boolean(eventLink) && cluster.messages.some((clusterMessage) =>
          clusterMessage.links.some((candidate) => eventSpecificLink(candidate) === eventLink)
        );
      });
      return tokenScore >= CLUSTER_THRESHOLD || containmentScore >= CLUSTER_CONTAINMENT_THRESHOLD || sharedLink;
    });

    if (matchingCluster) {
      matchingCluster.messages.push(message);
      matchingCluster.tokens = Array.from(new Set([...matchingCluster.tokens, ...tokens]));
      continue;
    }

    clusters.push({
      id: `cluster_${stableHash(`${message.source.id}:${message.text}`)}`,
      messages: [message],
      tokens
    });
  }

  return clusters;
}

function eventSpecificLink(value: string): string | undefined {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./u, "").replace(/^twitter\.com$/u, "x.com");
    const path = url.pathname.replace(/\/+$/u, "");
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) return undefined;
    if (host === "whatsapp.com" && segments[0] === "channel") return undefined;
    if (host === "t.me" && segments.length < 2) return undefined;
    if (host === "x.com" && !segments.includes("status")) return undefined;
    if (host === "instagram.com" && !["p", "reel", "tv"].includes(segments[0] ?? "")) return undefined;
    return `${host}${path}`;
  } catch {
    return undefined;
  }
}

function tokenContainment(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const a = new Set(left);
  const b = new Set(right);
  const intersection = Array.from(a).filter((token) => b.has(token)).length;
  return intersection / Math.min(a.size, b.size);
}
