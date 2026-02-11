import type {
  ClusterStats,
  GraphEdge,
  GraphNode,
  StructuralGap,
} from "./types";

export function toDateSafe(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function getNeighborhood(
  nodeId: string,
  edges: GraphEdge[],
  depth: number,
): Set<string> {
  const visited = new Set([nodeId]);
  let frontier = new Set([nodeId]);
  for (let d = 0; d < depth; d++) {
    const next = new Set<string>();
    for (const edge of edges) {
      const src =
        typeof edge.source === "string"
          ? edge.source
          : (edge.source as unknown as { id: string }).id;
      const tgt =
        typeof edge.target === "string"
          ? edge.target
          : (edge.target as unknown as { id: string }).id;
      if (frontier.has(src) && !visited.has(tgt)) next.add(tgt);
      if (frontier.has(tgt) && !visited.has(src)) next.add(src);
    }
    for (const id of next) visited.add(id);
    frontier = next;
  }
  return visited;
}

export function computeClusterStats(
  nodes: GraphNode[],
  edges: GraphEdge[],
): ClusterStats {
  const clusterByNode = new Map<string, number>();
  const visited = new Set<string>();
  const adjacency = new Map<string, Set<string>>();

  for (const node of nodes) {
    adjacency.set(node.id, new Set());
  }
  for (const edge of edges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  let clusterId = 0;
  const clusterSizes = new Map<number, number>();

  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    clusterId += 1;
    const queue = [node.id];
    visited.add(node.id);
    let size = 0;

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      size += 1;
      clusterByNode.set(current, clusterId);
      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    clusterSizes.set(clusterId, size);
  }

  return { clusterByNode, clusterSizes, totalClusters: clusterId };
}

function getTopTags(nodes: GraphNode[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    for (const tag of n.tags || []) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

export function computeStructuralGaps(
  nodes: GraphNode[],
  edges: GraphEdge[],
  clusterStats: ClusterStats,
): StructuralGap[] {
  const gaps: StructuralGap[] = [];
  const clusterIds = [...clusterStats.clusterSizes.entries()]
    .filter(([_, size]) => size >= 3)
    .map(([id]) => id);

  const clusterNodes = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const cid = clusterStats.clusterByNode.get(node.id);
    if (cid === undefined) continue;
    if (!clusterNodes.has(cid)) clusterNodes.set(cid, []);
    clusterNodes.get(cid)?.push(node);
  }

  const crossEdgeCount = new Map<string, number>();
  for (const edge of edges) {
    const cSrc = clusterStats.clusterByNode.get(edge.source);
    const cTgt = clusterStats.clusterByNode.get(edge.target);
    if (cSrc !== undefined && cTgt !== undefined && cSrc !== cTgt) {
      const key = cSrc < cTgt ? `${cSrc}-${cTgt}` : `${cTgt}-${cSrc}`;
      crossEdgeCount.set(key, (crossEdgeCount.get(key) || 0) + 1);
    }
  }

  for (let i = 0; i < clusterIds.length; i++) {
    for (let j = i + 1; j < clusterIds.length; j++) {
      const a = clusterIds[i];
      const b = clusterIds[j];
      const sizeA = clusterStats.clusterSizes.get(a) || 0;
      const sizeB = clusterStats.clusterSizes.get(b) || 0;
      const possibleEdges = sizeA * sizeB;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const actualEdges = crossEdgeCount.get(key) || 0;

      if (possibleEdges > 0 && actualEdges / possibleEdges < 0.05) {
        gaps.push({
          clusterA: a,
          clusterB: b,
          tagsA: getTopTags(clusterNodes.get(a) || [], 3),
          tagsB: getTopTags(clusterNodes.get(b) || [], 3),
          actualEdges,
          possibleEdges,
        });
      }
    }
  }

  return gaps.sort((a, b) => b.possibleEdges - a.possibleEdges).slice(0, 3);
}
