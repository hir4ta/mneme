import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type {
  ClusterStats,
  GraphNode,
  GraphRenderLink,
  GraphRenderNode,
  StructuralGap,
} from "./types";
import { typeColors } from "./types";

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

function SidebarSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-2">
          <CollapsibleTrigger className="flex w-full items-center justify-between">
            <CardTitle className="text-sm">{title}</CardTitle>
            <svg
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform"
              style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              role="img"
              aria-label="Toggle"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function GraphSidebar(props: GraphSidebarProps) {
  const { t } = useTranslation("graph");

  // Compute pipeline counts once
  const counts = { session: 0, decision: 0, pattern: 0, rule: 0 };
  for (const node of props.graphData.nodes) {
    const n = node as GraphRenderNode;
    if (n.entityType === "session") counts.session++;
    else if (n.unitSubtype === "decision") counts.decision++;
    else if (n.unitSubtype === "pattern") counts.pattern++;
    else if (n.unitSubtype === "rule") counts.rule++;
  }

  const stages = [
    {
      labelKey: "pipeline.sessions" as const,
      count: counts.session,
      color: typeColors.session,
    },
    {
      labelKey: "pipeline.decisions" as const,
      count: counts.decision,
      color: typeColors.decision,
    },
    {
      labelKey: "pipeline.patterns" as const,
      count: counts.pattern,
      color: typeColors.pattern,
    },
    {
      labelKey: "pipeline.rules" as const,
      count: counts.rule,
      color: typeColors.rule,
    },
  ];

  return (
    <div className="space-y-3">
      {/* Knowledge Pipeline — always visible (no accordion) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("pipeline.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-1 text-xs">
            {stages.map((stage, i) => (
              <div key={stage.labelKey} className="flex items-center gap-1">
                <div className="flex flex-col items-center">
                  <span
                    className="text-base font-bold"
                    style={{ color: stage.color }}
                  >
                    {stage.count}
                  </span>
                  <span className="text-muted-foreground">
                    {t(stage.labelKey)}
                  </span>
                </div>
                {i < stages.length - 1 && (
                  <span className="mx-0.5 text-muted-foreground">→</span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <SidebarSection title={t("sessionTypes")}>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: typeColors.session }}
            />
            <span>{t("types.session")}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rotate-45 rounded-sm"
              style={{ backgroundColor: typeColors.decision }}
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
              <polygon points="6,0 12,10.4 0,10.4" fill={typeColors.pattern} />
            </svg>
            <span>{t("detail.unitType.pattern")}</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-none"
              style={{ backgroundColor: typeColors.rule }}
            />
            <span>{t("detail.unitType.rule")}</span>
          </div>
        </div>
      </SidebarSection>

      <SidebarSection title={t("graphStats.title")} defaultOpen={false}>
        <div className="space-y-1 text-sm">
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
        </div>
      </SidebarSection>

      <SidebarSection title={t("topTags.title")} defaultOpen={false}>
        <div className="flex flex-wrap gap-2">
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
        </div>
      </SidebarSection>

      <SidebarSection title={t("centrality.title")} defaultOpen={false}>
        <div className="space-y-2 text-sm">
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
        </div>
      </SidebarSection>

      {props.structuralGaps.length > 0 && (
        <SidebarSection title={t("gaps.title")} defaultOpen={false}>
          <div className="space-y-3 text-sm">
            {props.structuralGaps.map((gap) => (
              <div
                key={`gap-${gap.clusterA}-${gap.clusterB}`}
                className="space-y-1 rounded border p-2"
              >
                <div className="flex flex-wrap items-center gap-1">
                  {gap.tagsA.map((tag) => (
                    <Badge
                      key={`a-${tag}`}
                      variant="secondary"
                      className="text-xs"
                    >
                      {tag}
                    </Badge>
                  ))}
                  <span className="mx-1 text-muted-foreground">↔</span>
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
            <p className="text-xs italic text-muted-foreground">
              {t("gaps.bridgeHint")}
            </p>
          </div>
        </SidebarSection>
      )}
    </div>
  );
}
