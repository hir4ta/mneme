import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePageDescription } from "@/components/page-description";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GraphCanvas } from "./graph-canvas";
import { GraphControls } from "./graph-controls";
import { GraphDetailDialog } from "./graph-detail-dialog";
import { GraphSidebar } from "./graph-sidebar";
import type {
  ColorMode,
  EntityFilter,
  GraphNode,
  GraphRenderNode,
  LayoutMode,
} from "./types";
import { useGraphData } from "./use-graph-data";

export function GraphPage() {
  const { t } = useTranslation("graph");
  const desc = usePageDescription("graph");

  // Filter states
  const [query, setQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState<EntityFilter>("all");
  const [selectedTag, setSelectedTag] = useState("all");
  const [minEdgeWeight, setMinEdgeWeight] = useState(1);
  const [recentDays, setRecentDays] = useState(0);
  const [colorMode, setColorMode] = useState<ColorMode>("type");
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("force");
  const [branchFilter, setBranchFilter] = useState("all");
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [focusDepth, setFocusDepth] = useState(2);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  // Time animation
  const [isPlaying, setIsPlaying] = useState(false);
  const animRef = useRef<number>();
  useEffect(() => {
    if (!isPlaying) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }
    let start: number | undefined;
    const animate = (ts: number) => {
      if (start === undefined) start = ts;
      const elapsed = ts - start;
      const progress = Math.min(elapsed / 3000, 1);
      setRecentDays(Math.round(365 * (1 - progress)));
      if (progress < 1) animRef.current = requestAnimationFrame(animate);
      else setIsPlaying(false);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying]);

  const graphResult = useGraphData({
    query,
    entityFilter,
    selectedTag,
    minEdgeWeight,
    recentDays,
    colorMode,
    focusNodeId,
    focusDepth,
    branchFilter,
  });

  // Compute branches from data
  const branches = useMemo(() => {
    if (!graphResult.filteredGraph) return [];
    return [
      ...new Set(
        graphResult.filteredGraph.nodes
          .filter((n) => n.branch)
          .map((n) => n.branch as string),
      ),
    ].sort();
  }, [graphResult.filteredGraph]);

  // Clear selected node if filtered out
  useEffect(() => {
    if (!selectedNode) return;
    if (
      !graphResult.filteredGraph.nodes.some(
        (node) => node.id === selectedNode.id,
      )
    ) {
      setSelectedNode(null);
    }
  }, [graphResult.filteredGraph.nodes, selectedNode]);

  const handleNodeClick = useCallback(
    (node: GraphRenderNode) => {
      if (!node.id || !node.entityType || !node.entityId) return;
      const selected = graphResult.filteredGraph.nodes.find(
        (item) => item.id === node.id,
      );
      if (selected) setSelectedNode(selected);
    },
    [graphResult.filteredGraph.nodes],
  );

  if (graphResult.error) {
    return (
      <div className="py-12 text-center text-destructive">
        {t("errors:failedToLoad.graph")}
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4 overflow-hidden">
      <div className="mb-1">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          <desc.Trigger />
        </div>
        <desc.Panel>
          <p>{t("pageDescription.intro")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5">
              <svg
                className="h-3.5 w-3.5 shrink-0"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <circle cx="8" cy="8" r="7" fill="#40513B" />
              </svg>
              {t("pageDescription.nodeSession")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg
                className="h-3.5 w-3.5 shrink-0"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <rect
                  x="1"
                  y="1"
                  width="14"
                  height="14"
                  rx="2"
                  fill="#628141"
                />
              </svg>
              {t("pageDescription.nodeRule")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg
                className="h-3.5 w-3.5 shrink-0"
                viewBox="0 0 24 4"
                aria-hidden="true"
              >
                <line
                  x1="0"
                  y1="2"
                  x2="24"
                  y2="2"
                  stroke="#6b7280"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
              {t("pageDescription.edge")}
            </span>
          </div>
          <p className="mt-2">
            {t("pageDescription.line")} {t("pageDescription.interaction")}
          </p>
        </desc.Panel>
      </div>

      <GraphControls
        query={query}
        onQueryChange={setQuery}
        entityFilter={entityFilter}
        onEntityFilterChange={setEntityFilter}
        minEdgeWeight={minEdgeWeight}
        onMinEdgeWeightChange={setMinEdgeWeight}
        maxEdgeWeight={graphResult.maxEdgeWeight}
        colorMode={colorMode}
        onColorModeChange={setColorMode}
        recentDays={recentDays}
        onRecentDaysChange={setRecentDays}
        selectedTag={selectedTag}
        onSelectedTagChange={setSelectedTag}
        tagCounts={graphResult.tagCounts}
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
        branchFilter={branchFilter}
        onBranchFilterChange={setBranchFilter}
        branches={branches}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying((prev) => !prev)}
        focusNodeId={focusNodeId}
        focusDepth={focusDepth}
        onFocusDepthChange={setFocusDepth}
        onClearFocus={() => setFocusNodeId(null)}
      />

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="min-h-0 overflow-hidden">
          <CardContent className="relative p-0">
            {graphResult.isLoading ? (
              <Skeleton className="h-full min-h-[420px] w-full" />
            ) : (
              <GraphCanvas
                graphData={graphResult.graphData}
                onNodeClick={handleNodeClick}
                onNodeHover={() => {}}
                layoutMode={layoutMode}
              />
            )}
          </CardContent>
        </Card>

        <div className="min-h-0 overflow-y-auto">
          <GraphSidebar
            graphData={graphResult.graphData}
            clusterStats={graphResult.clusterStats}
            graphDensity={graphResult.graphDensity}
            largestClusterSize={graphResult.largestClusterSize}
            tagCounts={graphResult.tagCounts}
            centralNodes={graphResult.centralNodes}
            onNodeSelect={setSelectedNode}
            structuralGaps={graphResult.structuralGaps}
          />
        </div>
      </div>

      <GraphDetailDialog
        selectedNode={selectedNode}
        onClose={() => setSelectedNode(null)}
        onNodeSelect={setSelectedNode}
        onFocusNode={(id) => {
          setFocusNodeId(id);
          setSelectedNode(null);
        }}
        filteredGraph={graphResult.filteredGraph}
        nodeDegree={graphResult.nodeDegree}
      />
    </div>
  );
}
