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
      const sharedLink = message.links.some((link) =>
        cluster.messages.some((clusterMessage) => clusterMessage.links.includes(link))
      );
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

function tokenContainment(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const a = new Set(left);
  const b = new Set(right);
  const intersection = Array.from(a).filter((token) => b.has(token)).length;
  return intersection / Math.min(a.size, b.size);
}
