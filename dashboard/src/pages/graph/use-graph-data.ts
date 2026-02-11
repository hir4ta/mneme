import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  computeClusterStats,
  computeStructuralGaps,
  getNeighborhood,
  toDateSafe,
} from "./graph-analytics";
import type {
  ColorMode,
  EntityFilter,
  GraphData,
  GraphEdge,
  GraphNode,
  GraphRenderLink,
  GraphRenderNode,
} from "./types";
import { clusterColors, typeColors } from "./types";

async function fetchGraph(): Promise<GraphData> {
  const res = await fetch("/api/knowledge-graph");
  if (!res.ok) throw new Error("Failed to fetch graph");
  return res.json();
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
      )
        return false;
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

    if (params.focusNodeId && nodeIds.has(params.focusNodeId)) {
      const neighborhood = getNeighborhood(
        params.focusNodeId,
        edges,
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

  const clusterStats = useMemo(
    () => computeClusterStats(filteredGraph.nodes, filteredGraph.edges),
    [filteredGraph.edges, filteredGraph.nodes],
  );

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

  const structuralGaps = useMemo(
    () =>
      computeStructuralGaps(
        filteredGraph.nodes,
        filteredGraph.edges,
        clusterStats,
      ),
    [filteredGraph.nodes, filteredGraph.edges, clusterStats],
  );

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
