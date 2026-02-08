import { useQuery } from "@tanstack/react-query";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getSession, getUnitById } from "@/lib/api";

const ForceGraph2D = lazy(() => import("react-force-graph-2d"));

function useContainerDimensions(ref: React.RefObject<HTMLDivElement | null>) {
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  useEffect(() => {
    const updateDimensions = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const availableHeight = window.innerHeight - rect.top - 24;
      setDimensions({
        width: ref.current.offsetWidth,
        height: Math.max(320, availableHeight),
      });
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [ref]);

  return dimensions;
}

interface GraphNode {
  id: string;
  entityId: string;
  entityType: "session" | "unit" | "unknown";
  title: string;
  tags: string[];
  createdAt: string;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  sharedTags: string[];
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphRenderNode extends GraphNode {
  color: string;
  val: number;
}

interface GraphRenderLink {
  source: string;
  target: string;
  value: number;
  sharedTags: string[];
}

async function fetchGraph(): Promise<GraphData> {
  const res = await fetch("/api/knowledge-graph");
  if (!res.ok) throw new Error("Failed to fetch graph");
  return res.json();
}

const typeColors: Record<string, string> = {
  session: "#3b82f6",
  unit: "#ec4899",
  unknown: "#6b7280",
};

const clusterColors = [
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

type ColorMode = "type" | "cluster";
type EntityFilter = "all" | "session" | "unit";

function toDateSafe(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function GraphPage() {
  const { t } = useTranslation("graph");
  const graphRef = useRef<unknown>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const [query, setQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState<EntityFilter>("all");
  const [selectedTag, setSelectedTag] = useState("all");
  const [minEdgeWeight, setMinEdgeWeight] = useState(1);
  const [recentDays, setRecentDays] = useState(0);
  const [colorMode, setColorMode] = useState<ColorMode>("type");

  const dimensions = useContainerDimensions(containerRef);

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
    const normalizedQuery = query.trim().toLowerCase();
    const minCreatedAt =
      recentDays > 0 ? Date.now() - recentDays * 24 * 60 * 60 * 1000 : 0;

    const nodes = baseData.nodes.filter((node) => {
      if (entityFilter !== "all" && node.entityType !== entityFilter)
        return false;
      if (selectedTag !== "all" && !(node.tags || []).includes(selectedTag)) {
        return false;
      }
      if (minCreatedAt > 0 && toDateSafe(node.createdAt) < minCreatedAt)
        return false;
      if (!normalizedQuery) return true;
      const haystack =
        `${node.title} ${(node.tags || []).join(" ")}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = baseData.edges.filter(
      (edge) =>
        nodeIds.has(edge.source) &&
        nodeIds.has(edge.target) &&
        edge.weight >= minEdgeWeight,
    );

    return { nodes, edges };
  }, [
    baseData.edges,
    baseData.nodes,
    entityFilter,
    minEdgeWeight,
    query,
    recentDays,
    selectedTag,
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

  const clusterStats = useMemo(() => {
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
        colorMode === "cluster"
          ? clusterColors[(clusterId - 1) % clusterColors.length]
          : typeColors[node.entityType] || typeColors.unknown;

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
    }));

    return { nodes, links };
  }, [clusterStats.clusterByNode, colorMode, filteredGraph, nodeDegree]);

  const centralNodes = useMemo(() => {
    return [...filteredGraph.nodes]
      .map((node) => ({ node, degree: nodeDegree.get(node.id) || 0 }))
      .sort((a, b) => b.degree - a.degree)
      .slice(0, 5);
  }, [filteredGraph.nodes, nodeDegree]);

  const selectedNodeNeighbors = useMemo(() => {
    if (!selectedNode) return [];

    const relationMap = new Map<
      string,
      { weight: number; sharedTags: string[] }
    >();
    for (const edge of filteredGraph.edges) {
      if (edge.source === selectedNode.id) {
        relationMap.set(edge.target, {
          weight: edge.weight,
          sharedTags: edge.sharedTags || [],
        });
      }
      if (edge.target === selectedNode.id) {
        relationMap.set(edge.source, {
          weight: edge.weight,
          sharedTags: edge.sharedTags || [],
        });
      }
    }

    const nodeById = new Map(
      filteredGraph.nodes.map((node) => [node.id, node]),
    );

    return Array.from(relationMap.entries())
      .map(([id, relation]) => {
        const node = nodeById.get(id);
        if (!node) return null;
        return { node, relation };
      })
      .filter(
        (
          item,
        ): item is {
          node: GraphNode;
          relation: { weight: number; sharedTags: string[] };
        } => !!item,
      )
      .sort((a, b) => b.relation.weight - a.relation.weight)
      .slice(0, 8);
  }, [filteredGraph.edges, filteredGraph.nodes, selectedNode]);

  const selectedNodeDetail = useQuery({
    queryKey: [
      "graph-node-detail",
      selectedNode?.entityType,
      selectedNode?.entityId,
    ],
    enabled: !!selectedNode,
    queryFn: async () => {
      if (!selectedNode) return null;
      if (selectedNode.entityType === "session")
        return getSession(selectedNode.entityId);
      if (selectedNode.entityType === "unit")
        return getUnitById(selectedNode.entityId);
      return null;
    },
  });

  useEffect(() => {
    if (!selectedNode) return;
    if (!filteredGraph.nodes.some((node) => node.id === selectedNode.id)) {
      setSelectedNode(null);
    }
  }, [filteredGraph.nodes, selectedNode]);

  const handleNodeClick = useCallback(
    (node: { id?: string; entityType?: string; entityId?: string }) => {
      if (!node.id || !node.entityType || !node.entityId) return;
      const selected = filteredGraph.nodes.find((item) => item.id === node.id);
      if (selected) setSelectedNode(selected);
    },
    [filteredGraph.nodes],
  );

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    setHoveredNode(node);
  }, []);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      setMousePos({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    },
    [],
  );

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

  if (error) {
    return (
      <div className="py-12 text-center text-destructive">
        {t("errors:failedToLoad.graph")}
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col gap-4 pb-6">
      <div className="mb-1">
        <h1 className="text-xl font-bold">{t("title")}</h1>
        <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{t("controls.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t("controls.search")}
              </p>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("controls.searchPlaceholder")}
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t("controls.type")}
              </p>
              <Select
                value={entityFilter}
                onValueChange={(value) =>
                  setEntityFilter(value as EntityFilter)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("controls.types.all")}</SelectItem>
                  <SelectItem value="session">{t("types.session")}</SelectItem>
                  <SelectItem value="unit">{t("types.unit")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t("controls.minWeight")}
              </p>
              <Select
                value={String(minEdgeWeight)}
                onValueChange={(value) => setMinEdgeWeight(Number(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({
                    length: Math.max(1, Math.min(8, maxEdgeWeight)),
                  }).map((_, idx) => {
                    const weight = idx + 1;
                    return (
                      <SelectItem key={weight} value={String(weight)}>
                        {t("controls.minWeightValue", { value: weight })}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t("controls.colorMode")}
              </p>
              <Select
                value={colorMode}
                onValueChange={(value) => setColorMode(value as ColorMode)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="type">
                    {t("controls.colorModes.type")}
                  </SelectItem>
                  <SelectItem value="cluster">
                    {t("controls.colorModes.cluster")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-1">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{t("controls.timeWindow")}</span>
                <span>
                  {recentDays === 0
                    ? t("controls.timeAll")
                    : t("controls.timeDays", { days: recentDays })}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="365"
                step="5"
                value={recentDays}
                onChange={(event) => setRecentDays(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-primary"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Badge
              className="cursor-pointer"
              variant={selectedTag === "all" ? "default" : "outline"}
              onClick={() => setSelectedTag("all")}
            >
              {t("controls.tagsAll")}
            </Badge>
            {tagCounts.slice(0, 12).map(([tag, count]) => (
              <Badge
                key={tag}
                className="cursor-pointer"
                variant={selectedTag === tag ? "default" : "secondary"}
                onClick={() => setSelectedTag(tag)}
              >
                {tag} ({count})
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid min-h-0 gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="min-h-0 overflow-hidden">
          <CardContent
            className="relative p-0"
            ref={containerRef}
            onMouseMove={handleMouseMove}
          >
            {isLoading ? (
              <Skeleton className="h-full min-h-[420px] w-full" />
            ) : graphData.nodes.length === 0 ? (
              <div className="flex h-full min-h-[420px] items-center justify-center text-muted-foreground">
                {t("noSessions")}
              </div>
            ) : (
              <Suspense
                fallback={<Skeleton className="h-full min-h-[420px] w-full" />}
              >
                <ForceGraph2D
                  ref={graphRef}
                  graphData={graphData}
                  nodeColor="color"
                  nodeVal="val"
                  linkWidth={(link) =>
                    Math.sqrt((link as { value?: number }).value || 1)
                  }
                  linkColor={() => "#cbd5e1"}
                  onNodeClick={handleNodeClick}
                  onNodeHover={handleNodeHover}
                  width={dimensions.width}
                  height={dimensions.height}
                  backgroundColor="#ffffff"
                />
              </Suspense>
            )}

            {hoveredNode && (
              <div
                className="pointer-events-none absolute z-10 max-w-[280px] rounded-lg border border-stone-200 bg-white p-3 shadow-lg"
                style={{
                  left: Math.min(mousePos.x + 12, dimensions.width - 300),
                  top: Math.min(mousePos.y + 12, dimensions.height - 140),
                }}
              >
                <p className="mb-1 line-clamp-2 text-sm font-medium">
                  {hoveredNode.title}
                </p>
                <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      backgroundColor:
                        typeColors[hoveredNode.entityType] ||
                        typeColors.unknown,
                    }}
                  />
                  <span>{t(`types.${hoveredNode.entityType}`)}</span>
                </div>
                {hoveredNode.tags.length > 0 && (
                  <div className="mb-1 flex flex-wrap gap-1">
                    {hoveredNode.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-stone-100 px-1.5 py-0.5 text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                    {hoveredNode.tags.length > 4 && (
                      <span className="text-xs text-muted-foreground">
                        +{hoveredNode.tags.length - 4}
                      </span>
                    )}
                  </div>
                )}
                <p className="text-xs text-stone-400">
                  {t("clickToViewDetails")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("graphStats.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                {t("graphStats.nodes")}: {graphData.nodes.length}
              </p>
              <p>
                {t("graphStats.connections")}: {graphData.links.length}
              </p>
              <p>
                {t("graphStats.avgDegree")}:{" "}
                {graphData.nodes.length === 0
                  ? "0"
                  : (
                      (graphData.links.length * 2) /
                      Math.max(graphData.nodes.length, 1)
                    ).toFixed(1)}
              </p>
              <p>
                {t("graphStats.clusters")}: {clusterStats.totalClusters}
              </p>
              <p>
                {t("graphStats.largestCluster")}: {largestClusterSize}
              </p>
              <p>
                {t("graphStats.density")}: {graphDensity.toFixed(3)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("topTags.title")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {tagCounts.length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  {t("topTags.empty")}
                </span>
              ) : (
                tagCounts.slice(0, 8).map(([tag, count]) => (
                  <Badge key={tag} variant="secondary">
                    {tag} ({count})
                  </Badge>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("centrality.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {centralNodes.length === 0 ? (
                <span className="text-sm text-muted-foreground">
                  {t("centrality.empty")}
                </span>
              ) : (
                centralNodes.map(({ node, degree }) => (
                  <div
                    key={node.id}
                    className="flex items-center justify-between gap-3 rounded-sm border px-2 py-1.5"
                  >
                    <button
                      type="button"
                      className="max-w-[180px] cursor-pointer truncate text-left hover:underline"
                      onClick={() => setSelectedNode(node)}
                    >
                      {node.title}
                    </button>
                    <Badge variant="outline">{degree}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={!!selectedNode}
        onOpenChange={(open) => {
          if (!open) setSelectedNode(null);
        }}
      >
        <DialogContent
          className="sm:max-w-2xl max-h-[80vh] overflow-y-auto"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>
              {selectedNode?.title || t("detail.titleFallback")}
            </DialogTitle>
          </DialogHeader>

          {!selectedNode ? null : selectedNodeDetail.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  {t(`types.${selectedNode.entityType}`)}
                </Badge>
                <Badge variant="secondary">
                  {t("detail.connectedNodes")}:{" "}
                  {nodeDegree.get(selectedNode.id) || 0}
                </Badge>
                <Badge variant="outline">
                  {t("detail.id")}: {selectedNode.entityId}
                </Badge>
              </div>

              {selectedNode.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedNode.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {selectedNode.entityType === "session" &&
                selectedNodeDetail.data && (
                  <div className="space-y-2.5 text-sm">
                    <p className="text-muted-foreground">
                      {t("detail.createdAt")}:{" "}
                      {new Date(selectedNode.createdAt).toLocaleString()}
                    </p>
                    <p className="font-medium">{t("detail.summary")}</p>
                    <p className="whitespace-pre-wrap text-muted-foreground">
                      {(
                        selectedNodeDetail.data as {
                          summary?: { description?: string; goal?: string };
                        }
                      ).summary?.description ||
                        (
                          selectedNodeDetail.data as {
                            summary?: { description?: string; goal?: string };
                          }
                        ).summary?.goal ||
                        t("detail.noSummary")}
                    </p>
                  </div>
                )}

              {selectedNode.entityType === "unit" &&
                selectedNodeDetail.data && (
                  <div className="space-y-2.5 text-sm">
                    <p className="text-muted-foreground">
                      {t("detail.createdAt")}:{" "}
                      {new Date(selectedNode.createdAt).toLocaleString()}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline">
                        {t(
                          `detail.unitType.${
                            (selectedNodeDetail.data as { type: string }).type
                          }`,
                        )}
                      </Badge>
                      <Badge variant="outline">
                        {t(
                          `detail.unitStatus.${
                            (selectedNodeDetail.data as { status: string })
                              .status
                          }`,
                        )}
                      </Badge>
                      <Badge variant="outline">
                        {t(
                          `detail.unitKind.${
                            (selectedNodeDetail.data as { kind: string }).kind
                          }`,
                        )}
                      </Badge>
                    </div>
                    <p className="font-medium">{t("detail.summary")}</p>
                    <p className="whitespace-pre-wrap text-muted-foreground">
                      {(selectedNodeDetail.data as { summary?: string })
                        .summary || t("detail.noSummary")}
                    </p>
                  </div>
                )}

              {selectedNodeNeighbors.length > 0 && (
                <div className="space-y-2.5">
                  <p className="font-medium text-sm">
                    {t("detail.relatedNodes")}
                  </p>
                  <div className="space-y-2">
                    {selectedNodeNeighbors.map(({ node, relation }) => (
                      <div
                        key={node.id}
                        className="rounded border border-stone-200 p-2 text-sm"
                      >
                        <button
                          type="button"
                          className="cursor-pointer font-medium hover:underline"
                          onClick={() => setSelectedNode(node)}
                        >
                          {node.title}
                        </button>
                        <p className="text-xs text-muted-foreground">
                          {t("detail.sharedTagsCount", {
                            count: relation.weight,
                          })}
                        </p>
                        {relation.sharedTags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {relation.sharedTags.slice(0, 6).map((tag) => (
                              <Badge
                                key={`${node.id}-${tag}`}
                                variant="secondary"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
