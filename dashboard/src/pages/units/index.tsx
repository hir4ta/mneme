import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  deleteUnit,
  generateUnits,
  getApprovalQueue,
  getRuleDocument,
  getUnits,
  type Unit,
  updateUnitStatus,
} from "@/lib/api";
import { invalidateDashboardData } from "@/lib/invalidate-dashboard-data";

const statusColor: Record<string, "default" | "secondary" | "destructive"> = {
  approved: "default",
  pending: "secondary",
  rejected: "destructive",
};

function UnitItem({
  item,
  onStatusChange,
  onRequestDelete,
}: {
  item: Unit;
  onStatusChange: (
    id: string,
    status: "pending" | "approved" | "rejected",
  ) => Promise<void>;
  onRequestDelete: (id: string) => void;
}) {
  const { t } = useTranslation("units");
  const [processing, setProcessing] = useState(false);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="font-medium leading-tight">{item.title}</p>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {item.summary}
            </p>
          </div>
          <Badge variant={statusColor[item.status] || "secondary"}>
            {t(`status.${item.status}`)}
          </Badge>
        </div>

        <div className="flex flex-wrap gap-1">
          <Badge variant="outline">{t(`type.${item.type}`)}</Badge>
          {(item.type === "pattern" || item.kind !== "policy") && (
            <Badge variant="outline">
              {t(`kind.${item.kind || "policy"}`)}
            </Badge>
          )}
          {item.tags.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={processing || item.status === "approved"}
            onClick={async () => {
              setProcessing(true);
              try {
                await onStatusChange(item.id, "approved");
              } finally {
                setProcessing(false);
              }
            }}
          >
            {t("actions.approve")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={processing || item.status === "pending"}
            onClick={async () => {
              setProcessing(true);
              try {
                await onStatusChange(item.id, "pending");
              } finally {
                setProcessing(false);
              }
            }}
          >
            {t("actions.pending")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={processing || item.status === "rejected"}
            onClick={async () => {
              setProcessing(true);
              try {
                await onStatusChange(item.id, "rejected");
              } finally {
                setProcessing(false);
              }
            }}
          >
            {t("actions.reject")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive border-destructive/50 hover:text-destructive hover:bg-destructive/10"
            disabled={processing}
            onClick={() => onRequestDelete(item.id)}
          >
            {t("actions.delete")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function UnitsPage() {
  const { t } = useTranslation("units");
  const { t: tc } = useTranslation("common");
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const cardsQuery = useQuery({
    queryKey: ["units"],
    queryFn: () => getUnits(),
  });

  const queueQuery = useQuery({
    queryKey: ["approval-queue"],
    queryFn: getApprovalQueue,
  });

  const rulesQuery = useQuery({
    queryKey: ["units", "rules-availability"],
    queryFn: async () => {
      const [devRules, reviewRules] = await Promise.all([
        getRuleDocument("dev-rules"),
        getRuleDocument("review-guidelines"),
      ]);
      return {
        total: (devRules.items?.length || 0) + (reviewRules.items?.length || 0),
      };
    },
  });

  const cards = cardsQuery.data?.items || [];
  const filtered = cards.filter((item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q) ||
      item.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  });

  const refresh = async () => {
    await invalidateDashboardData(queryClient);
  };

  const hasRules = (rulesQuery.data?.total || 0) > 0;
  const disableGenerate =
    cardsQuery.isLoading || rulesQuery.isLoading || !hasRules;

  if (cardsQuery.error || queueQuery.error || rulesQuery.error) {
    return (
      <div className="text-center py-12 text-destructive">
        {t("errors.failedToLoad")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button
          onClick={async () => {
            setGenerating(true);
            try {
              await generateUnits();
              await refresh();
            } finally {
              setGenerating(false);
            }
          }}
          disabled={disableGenerate || generating}
        >
          {generating ? (
            <Spinner label={t("loading")} />
          ) : (
            t("actions.generate")
          )}
        </Button>
      </div>
      {!hasRules && !rulesQuery.isLoading && (
        <p className="text-sm text-muted-foreground">{t("requiresRules")}</p>
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t("concepts.title")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>{t("concepts.decision")}</p>
          <p>{t("concepts.pattern")}</p>
          <p>{t("concepts.rule")}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("stats.total")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {cards.length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("stats.pending")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {queueQuery.data?.totalPending || 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("stats.approved")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {cards.filter((card) => card.status === "approved").length}
          </CardContent>
        </Card>
      </div>

      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("searchPlaceholder")}
        className="max-w-md"
      />

      {cardsQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">
          <Spinner label={t("loading")} />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("noCards")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((item) => (
            <UnitItem
              key={item.id}
              item={item}
              onStatusChange={async (id, status) => {
                await updateUnitStatus(id, status);
                await refresh();
              }}
              onRequestDelete={setDeleteTargetId}
            />
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
        title={tc("deleteDialog.title")}
        description={tc("deleteDialog.description")}
        onConfirm={async () => {
          if (!deleteTargetId) return;
          await deleteUnit(deleteTargetId);
          await refresh();
          setDeleteTargetId(null);
        }}
      />
    </div>
  );
}
