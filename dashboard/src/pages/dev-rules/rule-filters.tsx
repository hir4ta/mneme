import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

export function RuleFilters({
  filters,
  setFilters,
  setSelectedIds,
  paginatedCount,
  allVisibleSelected,
  someVisibleSelected,
  visibleIds,
  selectedCount,
  bulkIsPending,
  onBulkApprove,
  onBulkReject,
}: {
  filters: { search: string; type: string; status: string };
  setFilters: (updates: Record<string, string | number>) => void;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  paginatedCount: number;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  visibleIds: Set<string>;
  selectedCount: number;
  bulkIsPending: boolean;
  onBulkApprove: () => void;
  onBulkReject: () => void;
}) {
  const { t } = useTranslation("devRules");
  const { t: tc } = useTranslation("common");

  const hasActiveFilters =
    filters.search !== "" || filters.type !== "all" || filters.status !== "all";

  return (
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
        <SelectTrigger className="w-[180px]" aria-label={t("filter.allTypes")}>
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
        <SelectTrigger className="w-[180px]" aria-label={t("filter.allStatus")}>
          <SelectValue placeholder={t("filter.allStatus")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("filter.allStatus")}</SelectItem>
          <SelectItem value="draft">{t("status.draft")}</SelectItem>
          <SelectItem value="approved">{t("status.approved")}</SelectItem>
          <SelectItem value="rejected">{t("status.rejected")}</SelectItem>
        </SelectContent>
      </Select>

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setFilters({ search: "", type: "all", status: "all", page: 1 });
            setSelectedIds(new Set());
          }}
        >
          <XIcon className="size-4 mr-1" />
          {tc("reset")}
        </Button>
      )}

      {paginatedCount > 0 && (
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
            aria-label={allVisibleSelected ? t("deselectAll") : t("selectAll")}
          />
          {t("selectAll")}
        </span>
      )}

      {selectedCount > 0 && (
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {t("selected", { count: selectedCount })}
          </span>
          <Button size="sm" disabled={bulkIsPending} onClick={onBulkApprove}>
            {bulkIsPending ? <Spinner label="" /> : t("actions.approveAll")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={bulkIsPending}
            onClick={onBulkReject}
          >
            {t("actions.rejectAll")}
          </Button>
        </div>
      )}
    </div>
  );
}
