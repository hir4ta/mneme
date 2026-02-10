import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ClusterStats,
  GraphNode,
  GraphRenderLink,
  GraphRenderNode,
  StructuralGap,
} from "./types";

interface GraphSidebarProps {
  graphData: { nodes: GraphRenderNode[]; links: GraphRenderLink[] };
  clusterStats: ClusterStats;
  graphDensity: number;
  largestClusterSize: number;
  tagCounts: [string, number][];
  centralNodes: { node: GraphNode; degree: number }[];
  onNodeSelect: (node: GraphNode) => void;
  structuralGaps: StructuralGap[];
}

export function GraphSidebar(props: GraphSidebarProps) {
  const { t } = useTranslation("graph");

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("sessionTypes")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: "#40513B" }}
            />
            <span>{t("types.session")}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rotate-45 rounded-sm"
              style={{ backgroundColor: "#628141" }}
            />
            <span>{t("detail.unitType.decision")}</span>
          </div>
          <div className="flex items-center gap-2">
            <svg
              className="h-3 w-3"
              viewBox="0 0 12 12"
              role="img"
              aria-label="Triangle"
            >
              <polygon points="6,0 12,10.4 0,10.4" fill="#E5D9B6" />
            </svg>
            <span>{t("detail.unitType.pattern")}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-none"
              style={{ backgroundColor: "#E67E22" }}
            />
            <span>{t("detail.unitType.rule")}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("graphStats.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            {t("graphStats.nodes")}: {props.graphData.nodes.length}
          </p>
          <p>
            {t("graphStats.connections")}: {props.graphData.links.length}
          </p>
          <p>
            {t("graphStats.avgDegree")}:{" "}
            {props.graphData.nodes.length === 0
              ? "0"
              : (
                  (props.graphData.links.length * 2) /
                  Math.max(props.graphData.nodes.length, 1)
                ).toFixed(1)}
          </p>
          <p>
            {t("graphStats.clusters")}: {props.clusterStats.totalClusters}
          </p>
          <p>
            {t("graphStats.largestCluster")}: {props.largestClusterSize}
          </p>
          <p>
            {t("graphStats.density")}: {props.graphDensity.toFixed(3)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("topTags.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {props.tagCounts.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              {t("topTags.empty")}
            </span>
          ) : (
            props.tagCounts.slice(0, 8).map(([tag, count]) => (
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
          {props.centralNodes.length === 0 ? (
            <span className="text-sm text-muted-foreground">
              {t("centrality.empty")}
            </span>
          ) : (
            props.centralNodes.map(({ node, degree }) => (
              <div
                key={node.id}
                className="flex items-center justify-between gap-3 rounded-sm border px-2 py-1.5"
              >
                <button
                  type="button"
                  className="max-w-[180px] cursor-pointer truncate text-left hover:underline"
                  onClick={() => props.onNodeSelect(node)}
                >
                  {node.title}
                </button>
                <Badge variant="outline">{degree}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {props.structuralGaps.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("gaps.title")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {props.structuralGaps.map((gap) => (
              <div
                key={`gap-${gap.clusterA}-${gap.clusterB}`}
                className="rounded border p-2 space-y-1"
              >
                <div className="flex items-center gap-1 flex-wrap">
                  {gap.tagsA.map((tag) => (
                    <Badge
                      key={`a-${tag}`}
                      variant="secondary"
                      className="text-xs"
                    >
                      {tag}
                    </Badge>
                  ))}
                  <span className="text-muted-foreground mx-1">↔</span>
                  {gap.tagsB.map((tag) => (
                    <Badge
                      key={`b-${tag}`}
                      variant="secondary"
                      className="text-xs"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("gaps.weakConnection", {
                    actual: gap.actualEdges,
                    possible: gap.possibleEdges,
                  })}
                </p>
              </div>
            ))}
            <p className="text-xs text-muted-foreground italic">
              {t("gaps.bridgeHint")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
