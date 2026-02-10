import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type {
  ClusterStats,
  ColorMode,
  EntityFilter,
  GraphData,
  GraphEdge,
  GraphNode,
  GraphRenderLink,
  GraphRenderNode,
  StructuralGap,
} from "./types";
import { clusterColors, typeColors } from "./types";

async function fetchGraph(): Promise<GraphData> {
  const res = await fetch("/api/knowledge-graph");
  if (!res.ok) throw new Error("Failed to fetch graph");
  return res.json();
}

function toDateSafe(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getNeighborhood(
  nodeId: string,
  edges: GraphEdge[],
  _allNodes: GraphNode[],
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

export function useGraphData(params: {
  query: string;
  entityFilter: EntityFilter;
  selectedTag: string;
  minEdgeWeight: number;
  recentDays: number;
  colorMode: ColorMode;
  focusNodeId: string | null;
  focusDepth: number;
  branchFilter: string;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["knowledge-graph"],
    queryFn: fetchGraph,
  });

  const baseData = useMemo(() => {
    if (!data) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    return { nodes: data.nodes, edges: data.edges };
  }, [data]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of baseData.nodes) {
      for (const tag of node.tags || []) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [baseData.nodes]);

  const maxEdgeWeight = useMemo(() => {
    let max = 1;
    for (const edge of baseData.edges) {
      max = Math.max(max, edge.weight || 1);
    }
    return max;
  }, [baseData.edges]);

  const filteredGraph = useMemo(() => {
    const normalizedQuery = params.query.trim().toLowerCase();
    const minCreatedAt =
      params.recentDays > 0
        ? Date.now() - params.recentDays * 24 * 60 * 60 * 1000
        : 0;

    let nodes = baseData.nodes.filter((node) => {
      if (
        params.entityFilter !== "all" &&
        node.entityType !== params.entityFilter
      )
        return false;
      if (
        params.selectedTag !== "all" &&
        !(node.tags || []).includes(params.selectedTag)
      ) {
        return false;
      }
      if (minCreatedAt > 0 && toDateSafe(node.createdAt) < minCreatedAt)
        return false;
      if (
        params.branchFilter !== "all" &&
        (node.branch || "") !== params.branchFilter
      )
        return false;
      if (!normalizedQuery) return true;
      const haystack =
        `${node.title} ${(node.tags || []).join(" ")}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    const nodeIds = new Set(nodes.map((node) => node.id));
    let edges = baseData.edges.filter(
      (edge) =>
        nodeIds.has(edge.source) &&
        nodeIds.has(edge.target) &&
        edge.weight >= params.minEdgeWeight,
    );

    // Focus node filtering via BFS neighborhood
    if (params.focusNodeId && nodeIds.has(params.focusNodeId)) {
      const neighborhood = getNeighborhood(
        params.focusNodeId,
        edges,
        nodes,
        params.focusDepth,
      );
      nodes = nodes.filter((node) => neighborhood.has(node.id));
      const focusNodeIds = new Set(nodes.map((n) => n.id));
      edges = edges.filter(
        (edge) =>
          focusNodeIds.has(edge.source) && focusNodeIds.has(edge.target),
      );
    }

    return { nodes, edges };
  }, [
    baseData.edges,
    baseData.nodes,
    params.entityFilter,
    params.minEdgeWeight,
    params.query,
    params.recentDays,
    params.selectedTag,
    params.branchFilter,
    params.focusNodeId,
    params.focusDepth,
  ]);

  const nodeDegree = useMemo(() => {
    const degree = new Map<string, number>();
    for (const edge of filteredGraph.edges) {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
    }
    for (const node of filteredGraph.nodes) {
      if (!degree.has(node.id)) degree.set(node.id, 0);
    }
    return degree;
  }, [filteredGraph.edges, filteredGraph.nodes]);

  const clusterStats = useMemo<ClusterStats>(() => {
    const clusterByNode = new Map<string, number>();
    const visited = new Set<string>();
    const adjacency = new Map<string, Set<string>>();

    for (const node of filteredGraph.nodes) {
      adjacency.set(node.id, new Set());
    }
    for (const edge of filteredGraph.edges) {
      adjacency.get(edge.source)?.add(edge.target);
      adjacency.get(edge.target)?.add(edge.source);
    }

    let clusterId = 0;
    const clusterSizes = new Map<number, number>();

    for (const node of filteredGraph.nodes) {
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
  }, [filteredGraph.edges, filteredGraph.nodes]);

  const graphData = useMemo(() => {
    const nodes: GraphRenderNode[] = filteredGraph.nodes.map((node) => {
      const degree = nodeDegree.get(node.id) || 0;
      const clusterId = clusterStats.clusterByNode.get(node.id) || 1;
      const color =
        params.colorMode === "cluster"
          ? clusterColors[(clusterId - 1) % clusterColors.length]
          : typeColors[node.unitSubtype || node.entityType] ||
            typeColors.unknown;

      return {
        ...node,
        color,
        val: Math.max(4, Math.min(14, 4 + degree * 1.2)),
      };
    });

    const links: GraphRenderLink[] = filteredGraph.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      value: edge.weight,
      sharedTags: edge.sharedTags || [],
      edgeType: edge.edgeType || "sharedTags",
      directed: edge.directed || false,
    }));

    return { nodes, links };
  }, [clusterStats.clusterByNode, params.colorMode, filteredGraph, nodeDegree]);

  const centralNodes = useMemo(() => {
    return [...filteredGraph.nodes]
      .map((node) => ({ node, degree: nodeDegree.get(node.id) || 0 }))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 5);
  }, [filteredGraph.nodes, nodeDegree]);

  const graphDensity = useMemo(() => {
    const n = filteredGraph.nodes.length;
    const e = filteredGraph.edges.length;
    if (n <= 1) return 0;
    return (2 * e) / (n * (n - 1));
  }, [filteredGraph.edges.length, filteredGraph.nodes.length]);

  const largestClusterSize = useMemo(() => {
    let max = 0;
    for (const size of clusterStats.clusterSizes.values()) {
      max = Math.max(max, size);
    }
    return max;
  }, [clusterStats.clusterSizes]);

  const structuralGaps = useMemo<StructuralGap[]>(() => {
    const gaps: StructuralGap[] = [];
    const clusterIds = [...clusterStats.clusterSizes.entries()]
      .filter(([_, size]) => size >= 3)
      .map(([id]) => id);

    // Get nodes by cluster
    const clusterNodes = new Map<number, GraphNode[]>();
    for (const node of filteredGraph.nodes) {
      const cid = clusterStats.clusterByNode.get(node.id);
      if (cid === undefined) continue;
      if (!clusterNodes.has(cid)) clusterNodes.set(cid, []);
      clusterNodes.get(cid)?.push(node);
    }

    // Get top tags per cluster
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

    // Count cross-cluster edges
    const crossEdgeCount = new Map<string, number>();
    for (const edge of filteredGraph.edges) {
      const cSrc = clusterStats.clusterByNode.get(edge.source);
      const cTgt = clusterStats.clusterByNode.get(edge.target);
      if (cSrc !== undefined && cTgt !== undefined && cSrc !== cTgt) {
        const key = cSrc < cTgt ? `${cSrc}-${cTgt}` : `${cTgt}-${cSrc}`;
        crossEdgeCount.set(key, (crossEdgeCount.get(key) || 0) + 1);
      }
    }

    // Find gaps between significant clusters
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
  }, [filteredGraph.nodes, filteredGraph.edges, clusterStats]);

  return {
    isLoading,
    error,
    graphData,
    filteredGraph,
    tagCounts,
    maxEdgeWeight,
    nodeDegree,
    clusterStats,
    centralNodes,
    graphDensity,
    largestClusterSize,
    structuralGaps,
  };
}
