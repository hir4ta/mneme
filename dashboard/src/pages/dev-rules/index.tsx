import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { usePageDescription } from "@/components/page-description";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import {
  type DevRuleItem,
  deleteDevRule,
  getDevRules,
  updateDevRuleStatus,
} from "@/lib/api";
import { invalidateDashboardData } from "@/lib/invalidate-dashboard-data";
import { RuleDetailDialog } from "./rule-detail-dialog";
import { RuleFilters } from "./rule-filters";
import { RuleItem } from "./rule-item";

type DevRuleStatus = DevRuleItem["status"];

const ITEMS_PER_PAGE = 20;

export function DevRulesPage() {
  const { t } = useTranslation("devRules");
  const desc = usePageDescription("dev-rules");
  const queryClient = useQueryClient();
  const [filters, setFilters] = useQueryStates({
    type: parseAsString.withDefault("all"),
    status: parseAsString.withDefault("all"),
    search: parseAsString.withDefault(""),
    page: parseAsInteger.withDefault(1),
  });
  const [deleteTarget, setDeleteTarget] = useState<DevRuleItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailItem, setDetailItem] = useState<DevRuleItem | null>(null);

  const deferredSearch = useDeferredValue(filters.search);

  const devRulesQuery = useQuery({
    queryKey: ["dev-rules"],
    queryFn: () => getDevRules(),
  });

  const allItems = devRulesQuery.data?.items || [];

  const filtered = useMemo(() => {
    return allItems.filter((item) => {
      if (filters.type !== "all" && item.type !== filters.type) return false;
      if (filters.status !== "all" && item.status !== filters.status)
        return false;
      const q = deferredSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [allItems, filters.type, filters.status, deferredSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(filters.page, totalPages);
  const paginatedItems = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const visibleIds = new Set(paginatedItems.map((item) => item.id));
  const allVisibleSelected =
    paginatedItems.length > 0 &&
    paginatedItems.every((item) => selectedIds.has(item.id));
  const someVisibleSelected = paginatedItems.some((item) =>
    selectedIds.has(item.id),
  );

  const refresh = async () => {
    await invalidateDashboardData(queryClient);
  };

  const itemById = useMemo(() => {
    const map = new Map<string, DevRuleItem>();
    for (const item of allItems) map.set(item.id, item);
    return map;
  }, [allItems]);

  const statusMutation = useMutation({
    mutationFn: ({
      item,
      status,
    }: {
      item: DevRuleItem;
      status: DevRuleStatus;
    }) => updateDevRuleStatus(item.type, item.sourceFile, item.id, status),
    onSuccess: () => {
      toast.success(t("actions.approve"));
      return refresh();
    },
    onError: () => toast.error(t("error")),
  });

  const deleteMutation = useMutation({
    mutationFn: (item: DevRuleItem) =>
      deleteDevRule(item.type, item.sourceFile, item.id),
    onSuccess: () => {
      setDeleteTarget(null);
      toast.success(t("actions.delete"));
      return refresh();
    },
    onError: () => toast.error(t("error")),
  });

  const bulkMutation = useMutation({
    mutationFn: (status: DevRuleStatus) =>
      Promise.all(
        Array.from(selectedIds)
          .map((id) => itemById.get(id))
          .filter((item): item is DevRuleItem => !!item)
          .map((item) =>
            updateDevRuleStatus(item.type, item.sourceFile, item.id, status),
          ),
      ),
    onSuccess: () => {
      setSelectedIds(new Set());
      toast.success(t("actions.approve"));
      return refresh();
    },
    onError: () => toast.error(t("error")),
  });

  if (devRulesQuery.error) {
    return (
      <div className="text-center py-12 text-destructive">{t("error")}</div>
    );
  }

  const draftCount = allItems.filter((i) => i.status === "draft").length;
  const approvedCount = allItems.filter((i) => i.status === "approved").length;
  const rejectedCount = allItems.filter((i) => i.status === "rejected").length;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          <desc.Trigger />
        </div>
        <desc.Panel>
          <p>{t("pageDescription.intro")}</p>
          <ul className="mt-1.5 list-disc list-inside space-y-0.5">
            <li>{t("pageDescription.decision")}</li>
            <li>{t("pageDescription.pattern")}</li>
            <li>{t("pageDescription.rule")}</li>
          </ul>
          <p className="mt-1.5">{t("pageDescription.approval")}</p>
        </desc.Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("stats.total")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {allItems.length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("stats.draft")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{draftCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("stats.approved")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {approvedCount}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("stats.rejected")}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {rejectedCount}
          </CardContent>
        </Card>
      </div>

      <RuleFilters
        filters={filters}
        setFilters={setFilters}
        setSelectedIds={setSelectedIds}
        paginatedCount={paginatedItems.length}
        allVisibleSelected={allVisibleSelected}
        someVisibleSelected={someVisibleSelected}
        visibleIds={visibleIds}
        selectedCount={selectedIds.size}
        bulkIsPending={bulkMutation.isPending}
        onBulkApprove={() => bulkMutation.mutate("approved")}
        onBulkReject={() => bulkMutation.mutate("rejected")}
      />

      {devRulesQuery.isLoading ? (
        <div className="text-sm text-muted-foreground">
          <Spinner label={t("loading")} />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {allItems.length === 0 ? t("noRules") : t("noMatch")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {paginatedItems.map((item) => (
            <RuleItem
              key={item.id}
              item={item}
              onStatusChange={async (ruleItem, status) => {
                await statusMutation.mutateAsync({
                  item: ruleItem,
                  status,
                });
              }}
              onRequestDelete={setDeleteTarget}
              onClick={setDetailItem}
              selected={selectedIds.has(item.id)}
              onSelect={(id, checked) => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (checked) next.add(id);
                  else next.delete(id);
                  return next;
                });
              }}
            />
          ))}
        </div>
      )}

      <Pagination
        page={currentPage}
        totalPages={totalPages}
        hasNext={currentPage < totalPages}
        hasPrev={currentPage > 1}
        onPageChange={(p) => {
          setFilters({ page: p });
          setSelectedIds(new Set());
        }}
      />

      <RuleDetailDialog
        item={detailItem}
        open={!!detailItem}
        onOpenChange={(open) => !open && setDetailItem(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("deleteConfirm.title")}
        description={t("deleteConfirm.description")}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteMutation.mutateAsync(deleteTarget);
        }}
      />
    </div>
  );
}
