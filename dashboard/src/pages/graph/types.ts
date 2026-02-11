export interface GraphNode {
  id: string;
  entityId: string;
  entityType: "session" | "rule";
  title: string;
  tags: string[];
  createdAt: string;
  // Enhanced fields
  unitSubtype?: "decision" | "pattern" | "rule";
  resumedFrom?: string;
  sourceId?: string;
  branch?: string;
  appliedCount?: number;
  acceptedCount?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  sharedTags: string[];
  edgeType: "sharedTags" | "resumedFrom" | "derivedFrom";
  directed: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphRenderNode extends GraphNode {
  color: string;
  val: number;
  x?: number;
  y?: number;
}

export interface GraphRenderLink {
  source: string;
  target: string;
  value: number;
  sharedTags: string[];
  edgeType: "sharedTags" | "resumedFrom" | "derivedFrom";
  directed: boolean;
}

export interface ClusterStats {
  clusterByNode: Map<string, number>;
  clusterSizes: Map<number, number>;
  totalClusters: number;
}

export interface StructuralGap {
  clusterA: number;
  clusterB: number;
  tagsA: string[];
  tagsB: string[];
  actualEdges: number;
  possibleEdges: number;
}

export type ColorMode = "type" | "cluster";
export type EntityFilter = "all" | "session" | "rule";
export type LayoutMode = "force" | "td";

export const typeColors: Record<string, string> = {
  session: "#40513B",
  decision: "#628141",
  pattern: "#2D8B7A",
  rule: "#E67E22",
  unknown: "#6b7280",
};

export const clusterColors = [
  "#f97316",
  "#10b981",
  "#3b82f6",
  "#e11d48",
  "#8b5cf6",
  "#14b8a6",
  "#f59e0b",
  "#6366f1",
  "#06b6d4",
  "#84cc16",
];
