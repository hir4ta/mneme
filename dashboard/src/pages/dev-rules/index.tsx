import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  type DevRuleItem,
  deleteDevRule,
  getDevRules,
  updateDevRuleStatus,
} from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import { invalidateDashboardData } from "@/lib/invalidate-dashboard-data";

type DevRuleStatus = DevRuleItem["status"];

const ITEMS_PER_PAGE = 20;

const statusVariant: Record<
  DevRuleStatus,
  "default" | "secondary" | "destructive"
> = {
  draft: "secondary",
  approved: "default",
  rejected: "destructive",
};

const typeStyle: Record<string, string> = {
  decision:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  pattern:
    "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  rule: "",
};

function TypeBadge({ type }: { type: string }) {
  const { t } = useTranslation("devRules");
  const style = typeStyle[type] || "";
  const label = t(`type.${type}`, type);
  return style ? (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {label}
    </span>
  ) : (
    <Badge variant="outline">{label}</Badge>
  );
}

function RuleItem({
  item,
  onStatusChange,
  onRequestDelete,
  onClick,
  selected,
  onSelect,
}: {
  item: DevRuleItem;
  onStatusChange: (item: DevRuleItem, status: DevRuleStatus) => Promise<void>;
  onRequestDelete: (item: DevRuleItem) => void;
  onClick: (item: DevRuleItem) => void;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
}) {
  const { t } = useTranslation("devRules");
  const [processing, setProcessing] = useState(false);

  return (
    <Card className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
      <CardContent className="px-3 py-2.5 space-y-2">
        <div className="flex items-start gap-2.5">
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onSelect(item.id, checked === true)}
            className="mt-1"
            aria-label={t("ariaSelectItem", { title: item.title })}
          />
          <button
            type="button"
            className="flex-1 min-w-0 cursor-pointer text-left bg-transparent border-0 p-0"
            onClick={() => onClick(item)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 min-w-0">
                <p className="font-medium leading-tight">{item.title}</p>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {item.summary}
                </p>
              </div>
              <Badge variant={statusVariant[item.status] || "default"}>
                {t(`status.${item.status}`, item.status)}
              </Badge>
            </div>
          </button>
        </div>

        <div className="flex items-end justify-between gap-3 pl-6.5">
          <div className="flex flex-wrap gap-1">
            <TypeBadge type={item.type} />
            {item.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
            {item.tags.length > 4 && (
              <Badge variant="secondary">+{item.tags.length - 4}</Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0 justify-end">
            <Button
              size="sm"
              disabled={processing || item.status === "approved"}
              onClick={async () => {
                setProcessing(true);
                try {
                  await onStatusChange(item, "approved");
                } finally {
                  setProcessing(false);
                }
              }}
            >
              {t("actions.approve")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={processing || item.status === "rejected"}
              onClick={async () => {
                setProcessing(true);
                try {
                  await onStatusChange(item, "rejected");
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
              onClick={() => onRequestDelete(item)}
            >
              {t("actions.delete")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RuleDetailDialog({
  item,
  open,
  onOpenChange,
}: {
  item: DevRuleItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("devRules");
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TypeBadge type={item.type} />
            {item.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
              {t("detail.summary")}
            </p>
            <p className="text-sm whitespace-pre-wrap">{item.summary}</p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
              {t("detail.status")}
            </p>
            <Badge variant={statusVariant[item.status] || "default"}>
              {t(`status.${item.status}`, item.status)}
            </Badge>
          </div>

          {item.sourceFile && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                {t("detail.source")}
              </p>
              <p className="text-sm font-mono text-muted-foreground">
                {item.type}: {item.sourceFile}
              </p>
            </div>
          )}

          {item.tags.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                {t("detail.tags")}
              </p>
              <div className="flex flex-wrap gap-1">
                {item.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide mb-1">
                {t("detail.created")}
              </p>
              <p>{formatDate(item.createdAt)}</p>
            </div>
            {item.updatedAt && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide mb-1">
                  {t("detail.updated")}
                </p>
                <p>{formatDate(item.updatedAt)}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DevRulesPage() {
  const { t } = useTranslation("devRules");
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

  // Build a lookup for items by id for bulk operations
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
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Stats */}
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

      {/* Filters + Select All + Bulk Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={filters.search}
          onChange={(e) => {
            setFilters({ search: e.target.value });
            setSelectedIds(new Set());
          }}
          placeholder={t("searchPlaceholder")}
          className="max-w-xs"
          aria-label={t("searchPlaceholder")}
        />
        <Select
          value={filters.type}
          onValueChange={(v) => {
            setFilters({ type: v, page: 1 });
            setSelectedIds(new Set());
          }}
        >
          <SelectTrigger
            className="w-[180px]"
            aria-label={t("filter.allTypes")}
          >
            <SelectValue placeholder={t("filter.allTypes")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allTypes")}</SelectItem>
            <SelectItem value="decision">{t("type.decision")}</SelectItem>
            <SelectItem value="pattern">{t("type.pattern")}</SelectItem>
            <SelectItem value="rule">{t("type.rule")}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.status}
          onValueChange={(v) => {
            setFilters({ status: v, page: 1 });
            setSelectedIds(new Set());
          }}
        >
          <SelectTrigger
            className="w-[180px]"
            aria-label={t("filter.allStatus")}
          >
            <SelectValue placeholder={t("filter.allStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filter.allStatus")}</SelectItem>
            <SelectItem value="draft">{t("status.draft")}</SelectItem>
            <SelectItem value="approved">{t("status.approved")}</SelectItem>
            <SelectItem value="rejected">{t("status.rejected")}</SelectItem>
          </SelectContent>
        </Select>

        {paginatedItems.length > 0 && (
          <span className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox
              checked={
                allVisibleSelected
                  ? true
                  : someVisibleSelected
                    ? "indeterminate"
                    : false
              }
              onCheckedChange={(checked) => {
                if (checked) {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    for (const id of visibleIds) next.add(id);
                    return next;
                  });
                } else {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    for (const id of visibleIds) next.delete(id);
                    return next;
                  });
                }
              }}
              aria-label={
                allVisibleSelected ? t("deselectAll") : t("selectAll")
              }
            />
            {t("selectAll")}
          </span>
        )}

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {t("selected", { count: selectedIds.size })}
            </span>
            <Button
              size="sm"
              disabled={bulkMutation.isPending}
              onClick={() => bulkMutation.mutate("approved")}
            >
              {bulkMutation.isPending ? (
                <Spinner label="" />
              ) : (
                t("actions.approveAll")
              )}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={bulkMutation.isPending}
              onClick={() => bulkMutation.mutate("rejected")}
            >
              {t("actions.rejectAll")}
            </Button>
          </div>
        )}
      </div>

      {/* List */}
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

      {/* Pagination */}
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

      {/* Detail Dialog */}
      <RuleDetailDialog
        item={detailItem}
        open={!!detailItem}
        onOpenChange={(open) => !open && setDetailItem(null)}
      />

      {/* Delete Confirm Dialog */}
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
