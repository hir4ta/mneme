import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
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
    <div className="flex min-h-full flex-col gap-4 pb-6">
      <div className="mb-1">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
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

      <div className="grid min-h-0 gap-5 lg:grid-cols-[1fr_320px]">
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
