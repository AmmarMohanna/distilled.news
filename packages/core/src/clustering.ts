import type { ClusterCandidate, NormalizedMessage } from "./types";
import { jaccardSimilarity, significantTokens, stableHash } from "./text";

const CLUSTER_THRESHOLD = 0.42;

export function clusterMessages(messages: NormalizedMessage[]): ClusterCandidate[] {
  const clusters: ClusterCandidate[] = [];

  for (const message of messages) {
    const tokens = significantTokens(message.text);
    const matchingCluster = clusters.find((cluster) => {
      const tokenScore = jaccardSimilarity(cluster.tokens, tokens);
      const sharedLink = message.links.some((link) =>
        cluster.messages.some((clusterMessage) => clusterMessage.links.includes(link))
      );
      return tokenScore >= CLUSTER_THRESHOLD || sharedLink;
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
