import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getSession, getUnitById } from "@/lib/api";
import { formatDateTime } from "@/lib/format-date";
import type { GraphEdge, GraphNode } from "./types";

interface GraphDetailDialogProps {
  selectedNode: GraphNode | null;
  onClose: () => void;
  onNodeSelect: (node: GraphNode) => void;
  onFocusNode: (nodeId: string) => void;
  filteredGraph: { nodes: GraphNode[]; edges: GraphEdge[] };
  nodeDegree: Map<string, number>;
}

export function GraphDetailDialog(props: GraphDetailDialogProps) {
  const { t } = useTranslation("graph");
  const { selectedNode, filteredGraph, nodeDegree } = props;

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

  const selectedNodeNeighbors = useMemo(() => {
    if (!selectedNode) return [];

    const relationMap = new Map<
      string,
      { weight: number; sharedTags: string[]; edgeType: string }
    >();
    for (const edge of filteredGraph.edges) {
      if (edge.source === selectedNode.id) {
        relationMap.set(edge.target, {
          weight: edge.weight,
          sharedTags: edge.sharedTags || [],
          edgeType: edge.edgeType || "sharedTags",
        });
      }
      if (edge.target === selectedNode.id) {
        relationMap.set(edge.source, {
          weight: edge.weight,
          sharedTags: edge.sharedTags || [],
          edgeType: edge.edgeType || "sharedTags",
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
          relation: {
            weight: number;
            sharedTags: string[];
            edgeType: string;
          };
        } => !!item,
      )
      .sort((a, b) => b.relation.weight - a.relation.weight)
      .slice(0, 8);
  }, [filteredGraph.edges, filteredGraph.nodes, selectedNode]);

  return (
    <Dialog
      open={!!selectedNode}
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogContent
        className="max-h-[80vh] overflow-y-auto sm:max-w-2xl"
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => props.onFocusNode(selectedNode.id)}
              >
                {t("detail.focusThisNode")}
              </Button>
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
                    {formatDateTime(selectedNode.createdAt)}
                  </p>
                  <p className="font-medium">{t("detail.summary")}</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {(
                      selectedNodeDetail.data as {
                        summary?: {
                          description?: string;
                          goal?: string;
                        };
                      }
                    ).summary?.description ||
                      (
                        selectedNodeDetail.data as {
                          summary?: {
                            description?: string;
                            goal?: string;
                          };
                        }
                      ).summary?.goal ||
                      t("detail.noSummary")}
                  </p>
                </div>
              )}

            {selectedNode.entityType === "unit" && selectedNodeDetail.data && (
              <div className="space-y-2.5 text-sm">
                <p className="text-muted-foreground">
                  {t("detail.createdAt")}:{" "}
                  {formatDateTime(selectedNode.createdAt)}
                </p>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="outline">
                    {t(
                      `detail.unitType.${
                        (
                          selectedNodeDetail.data as {
                            type: string;
                          }
                        ).type
                      }`,
                    )}
                  </Badge>
                  <Badge variant="outline">
                    {t(
                      `detail.unitStatus.${
                        (
                          selectedNodeDetail.data as {
                            status: string;
                          }
                        ).status
                      }`,
                    )}
                  </Badge>
                  <Badge variant="outline">
                    {t(
                      `detail.unitKind.${
                        (
                          selectedNodeDetail.data as {
                            kind: string;
                          }
                        ).kind
                      }`,
                    )}
                  </Badge>
                </div>
                <p className="font-medium">{t("detail.summary")}</p>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {(
                    selectedNodeDetail.data as {
                      summary?: string;
                    }
                  ).summary || t("detail.noSummary")}
                </p>
              </div>
            )}

            {selectedNodeNeighbors.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-sm font-medium">
                  {t("detail.relatedNodes")}
                </p>
                <div className="space-y-2">
                  {selectedNodeNeighbors.map(({ node, relation }) => (
                    <div
                      key={node.id}
                      className="rounded border border-stone-200 p-2 text-sm dark:border-stone-700"
                    >
                      <button
                        type="button"
                        className="cursor-pointer font-medium hover:underline"
                        onClick={() => props.onNodeSelect(node)}
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
  );
}
