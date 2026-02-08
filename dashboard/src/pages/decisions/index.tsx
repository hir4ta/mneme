import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DecisionCardSkeletonList } from "@/components/ui/decision-card-skeleton";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useDecisions } from "@/hooks/use-decisions";
import { deleteDecision, getDecision } from "@/lib/api";
import { invalidateDashboardData } from "@/lib/invalidate-dashboard-data";
import type { Decision } from "@/lib/types";

function DecisionCard({
  decision,
  onClick,
}: {
  decision: Decision;
  onClick: () => void;
}) {
  const { i18n } = useTranslation("decisions");

  const date = new Date(decision.createdAt).toLocaleDateString(
    i18n.language === "ja" ? "ja-JP" : "en-US",
  );

  return (
    <Card
      className="hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors cursor-pointer h-full"
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <CardTitle className="text-sm font-medium line-clamp-2">
            {decision.title}
          </CardTitle>
        </div>
        <div className="text-xs text-stone-500 dark:text-stone-400 mb-2">
          {date}
        </div>
        {decision.tags && decision.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {decision.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs px-1.5 py-0"
              >
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DecisionDetailDialog({
  decisionId,
  open,
  onOpenChange,
  onDeleted,
}: {
  decisionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation("decisions");
  const { t: tc } = useTranslation("common");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (!decisionId || !open) {
      setDecision(null);
      return;
    }

    setLoading(true);
    getDecision(decisionId)
      .then(setDecision)
      .catch(() => setDecision(null))
      .finally(() => setLoading(false));
  }, [decisionId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl max-h-[80vh] overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>
            {loading ? (
              <Skeleton className="h-6 w-3/4" />
            ) : (
              decision?.title || tc("loading")
            )}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : decision ? (
          <div className="space-y-4">
            {/* Decision - main content */}
            <div className="space-y-1">
              <span className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide">
                {t("detail.decision")}
              </span>
              <div className="bg-stone-100 dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded px-4 py-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {decision.decision}
                </p>
              </div>
            </div>

            {/* Reasoning */}
            <div className="space-y-1">
              <span className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide">
                {t("detail.reasoning")}
              </span>
              <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded px-4 py-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-amber-900 dark:text-amber-100">
                  {decision.reasoning}
                </p>
              </div>
            </div>

            {/* Alternatives */}
            {decision.alternatives?.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide">
                  {t("detail.alternatives")}
                </span>
                <div className="space-y-2">
                  {decision.alternatives.map((alt) => {
                    // Support both 'name' (schema) and 'option' (legacy JSON)
                    const altName =
                      alt.name || (alt as { option?: string }).option;
                    return (
                      <div
                        key={`${altName}-${alt.reason}`}
                        className="border border-stone-300 dark:border-stone-600 rounded px-4 py-3"
                      >
                        <span className="font-medium text-sm">{altName}</span>
                        <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
                          {alt.reason}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tags */}
            {decision.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-2">
                {decision.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            <div className="pt-2">
              <Button
                variant="outline"
                className="text-destructive border-destructive/50 hover:text-destructive hover:bg-destructive/10"
                size="sm"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                {tc("delete")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            {tc("loading")}
          </div>
        )}
        <ConfirmDialog
          open={confirmDeleteOpen}
          onOpenChange={setConfirmDeleteOpen}
          title={tc("deleteDialog.title")}
          description={tc("deleteDialog.description")}
          onConfirm={async () => {
            if (!decision) return;
            await deleteDecision(decision.id);
            await onDeleted(decision.id);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function DecisionsPage() {
  const { t } = useTranslation("decisions");
  const { t: tc } = useTranslation("common");
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [selectedDecisionId, setSelectedDecisionId] = useState<string | null>(
    null,
  );
  const [deletedDecisionIds, setDeletedDecisionIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useMemo(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading, error } = useDecisions({
    page,
    limit: 20,
    tag: tagFilter !== "all" ? tagFilter : undefined,
    search: debouncedSearch || undefined,
  });

  // Get unique tags from decisions
  const availableTags = useMemo(() => {
    if (!data?.data) return [];
    const tagSet = new Set<string>();
    for (const decision of data.data) {
      for (const tag of decision.tags || []) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [data?.data]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
        </div>
        <DecisionCardSkeletonList count={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-destructive">
        {t("errors:failedToLoad.decisions")}
      </div>
    );
  }

  const decisions = (data?.data || []).filter(
    (decision) => !deletedDecisionIds.has(decision.id),
  );
  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("decisionCount", { count: pagination?.total || 0 })}
        </p>
      </div>

      {(pagination?.total || 0) === 0 &&
      !debouncedSearch &&
      tagFilter === "all" ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>{t("noDecisionsFound")}</p>
          <p className="text-sm mt-2">{t("noDecisionsDescription")}</p>
        </div>
      ) : (
        <>
          <div className="flex gap-4 items-center flex-wrap">
            <Input
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs"
            />
            <Select
              value={tagFilter}
              onValueChange={(value) => {
                setTagFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={tc("allTags")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tc("allTags")}</SelectItem>
                {availableTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {decisions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{t("noMatchingFilters")}</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                {decisions.map((decision) => (
                  <DecisionCard
                    key={decision.id}
                    decision={decision}
                    onClick={() => setSelectedDecisionId(decision.id)}
                  />
                ))}
              </div>

              {pagination && (
                <Pagination
                  page={pagination.page}
                  totalPages={pagination.totalPages}
                  hasNext={pagination.hasNext}
                  hasPrev={pagination.hasPrev}
                  onPageChange={setPage}
                />
              )}
            </>
          )}
        </>
      )}

      <DecisionDetailDialog
        decisionId={selectedDecisionId}
        open={!!selectedDecisionId}
        onOpenChange={(open) => !open && setSelectedDecisionId(null)}
        onDeleted={async (id) => {
          setDeletedDecisionIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
          setSelectedDecisionId(null);
          await invalidateDashboardData(queryClient);
        }}
      />
    </div>
  );
}
