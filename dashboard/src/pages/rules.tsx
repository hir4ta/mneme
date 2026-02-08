import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { deleteRule } from "@/lib/api";
import { invalidateDashboardData } from "@/lib/invalidate-dashboard-data";
import type { RuleDocument, RuleItem } from "@/types/rules";

const RULE_TYPES = ["dev-rules", "review-guidelines"] as const;
type RuleType = (typeof RULE_TYPES)[number];

const statusColors: Record<string, "default" | "secondary" | "destructive"> = {
  active: "default",
  deprecated: "secondary",
};

const priorityColors: Record<string, "default" | "secondary" | "destructive"> =
  {
    p0: "destructive",
    p1: "default",
    p2: "secondary",
  };

const uniqueSorted = (values: string[]) =>
  Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

type RuleWithType = RuleItem & { ruleType?: RuleType };

// Helper to get display text from rule item (supports both text and title/description schemas)
function getRuleDisplayText(item: RuleWithType): string {
  return item.text || item.title || "";
}

// Map severity to priority for legacy schema
function severityToPriority(severity?: string): "p0" | "p1" | "p2" | undefined {
  if (severity === "error") return "p0";
  if (severity === "warning") return "p1";
  return undefined;
}

function RuleCard({
  item,
  onClick,
}: {
  item: RuleWithType;
  onClick: () => void;
}) {
  const effectivePriority =
    item.priority ?? severityToPriority(item.severity) ?? "p2";
  const categoryValue = item.category ?? "general";
  const displayText = getRuleDisplayText(item);

  return (
    <Card
      className="hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors cursor-pointer h-full"
      onClick={onClick}
    >
      <CardContent className="p-3">
        <p className="text-sm font-medium line-clamp-2 mb-2">{displayText}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant={priorityColors[effectivePriority]}
            className="text-xs"
          >
            {effectivePriority}
          </Badge>
          <Badge
            variant={statusColors[item.status] ?? "secondary"}
            className="text-xs"
          >
            {item.status}
          </Badge>
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {categoryValue}
          </span>
          <span className="text-xs text-stone-400 dark:text-stone-500">
            {item.ruleType}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function RuleDetailDialog({
  item,
  open,
  onOpenChange,
  onSave,
  onDelete,
}: {
  item: RuleWithType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updated: RuleWithType) => Promise<void>;
  onDelete: (item: RuleWithType) => Promise<void>;
}) {
  const { t } = useTranslation("rules");
  const { t: tc } = useTranslation("common");
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<RuleWithType | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Reset state when dialog opens/closes or item changes
  useEffect(() => {
    if (open && item) {
      setDraft({ ...item });
      setIsEditing(false);
      setError(null);
    }
  }, [open, item]);

  if (!item) return null;

  const effectivePriority =
    item.priority ?? severityToPriority(item.severity) ?? "p2";
  const categoryValue = item.category ?? "general";
  const displayText = getRuleDisplayText(item);

  const updateDraft = <K extends keyof RuleWithType>(
    key: K,
    value: RuleWithType[K],
  ) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const handleSave = async () => {
    if (!draft) return;
    const trimmedText = getRuleDisplayText(draft).trim();
    if (!trimmedText) {
      setError(t("errors.emptyText"));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Preserve the original schema format (text vs title/description)
      const updates: Partial<RuleWithType> = {
        ...draft,
        category: draft.category?.trim() || undefined,
        rationale: draft.rationale?.trim() || undefined,
        updatedAt: new Date().toISOString(),
      };
      // Update the appropriate field based on schema
      if (draft.title !== undefined) {
        updates.title = trimmedText;
      } else {
        updates.text = trimmedText;
      }
      await onSave(updates as RuleWithType);
      setIsEditing(false);
      onOpenChange(false);
    } catch {
      setError(t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft({ ...item });
    setIsEditing(false);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl max-h-[80vh] overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={priorityColors[effectivePriority]}>
              {effectivePriority}
            </Badge>
            <Badge variant={statusColors[item.status] ?? "secondary"}>
              {item.status}
            </Badge>
            <span className="text-xs text-stone-500 dark:text-stone-400">
              {item.ruleType}
            </span>
          </div>
          <DialogTitle className="text-left">
            {isEditing ? t("editRule") : displayText}
          </DialogTitle>
        </DialogHeader>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {isEditing && draft ? (
          <div className="space-y-4">
            <div>
              <span className="text-xs font-medium text-muted-foreground block mb-1">
                {t("fields.text")}
              </span>
              <Textarea
                className="min-h-[80px]"
                value={getRuleDisplayText(draft)}
                onChange={(e) => {
                  // Update the appropriate field based on schema
                  if (draft.title !== undefined) {
                    updateDraft("title", e.target.value);
                  } else {
                    updateDraft("text", e.target.value);
                  }
                }}
              />
            </div>
            {/* Show description field if using title/description schema */}
            {draft.description !== undefined && (
              <div>
                <span className="text-xs font-medium text-muted-foreground block mb-1">
                  {t("fields.description")}
                </span>
                <Textarea
                  className="min-h-[60px]"
                  value={draft.description ?? ""}
                  onChange={(e) => updateDraft("description", e.target.value)}
                />
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <span className="text-xs font-medium text-muted-foreground block mb-1">
                  {t("fields.priority")}
                </span>
                <Select
                  value={draft.priority ?? "p2"}
                  onValueChange={(value) =>
                    updateDraft(
                      "priority",
                      value as NonNullable<RuleItem["priority"]>,
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="p0">p0 - Critical</SelectItem>
                    <SelectItem value="p1">p1 - Important</SelectItem>
                    <SelectItem value="p2">p2 - Normal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <span className="text-xs font-medium text-muted-foreground block mb-1">
                  {t("fields.status")}
                </span>
                <Select
                  value={draft.status}
                  onValueChange={(value) =>
                    updateDraft("status", value as RuleItem["status"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("status.active")}</SelectItem>
                    <SelectItem value="deprecated">
                      {t("status.deprecated")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground block mb-1">
                {t("fields.category")}
              </span>
              <Input
                value={draft.category ?? ""}
                onChange={(e) => updateDraft("category", e.target.value)}
                placeholder="general"
              />
            </div>
            <div>
              <span className="text-xs font-medium text-muted-foreground block mb-1">
                {t("fields.rationale")}
              </span>
              <Textarea
                className="min-h-[60px]"
                value={draft.rationale ?? ""}
                onChange={(e) => updateDraft("rationale", e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Show description if using title/description schema */}
            {item.description && (
              <div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t("fields.description")}
                </span>
                <p className="text-sm mt-1 whitespace-pre-wrap">
                  {item.description}
                </p>
              </div>
            )}
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("fields.category")}
              </span>
              <p className="text-sm mt-1">{categoryValue}</p>
            </div>
            {(item.rationale || item.check) && (
              <div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {item.check ? t("fields.check") : t("fields.rationale")}
                </span>
                <p className="text-sm mt-1 whitespace-pre-wrap">
                  {item.rationale || item.check}
                </p>
              </div>
            )}
            {item.source && (
              <div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t("fields.source")}
                </span>
                <p className="text-sm mt-1 text-stone-500">{item.source}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={saving}
              >
                {tc("cancel")}
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? tc("saving") : tc("save")}
              </Button>
            </>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsEditing(true)}>
                {tc("edit")}
              </Button>
              <Button
                variant="outline"
                className="text-destructive border-destructive/50 hover:text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmDeleteOpen(true)}
                disabled={saving}
              >
                {saving ? tc("deleting") : tc("delete")}
              </Button>
            </div>
          )}
        </DialogFooter>
        <ConfirmDialog
          open={confirmDeleteOpen}
          onOpenChange={setConfirmDeleteOpen}
          title={tc("deleteDialog.title")}
          description={tc("deleteDialog.description")}
          onConfirm={async () => {
            if (!item) return;
            setSaving(true);
            try {
              await onDelete(item);
              onOpenChange(false);
            } catch {
              setError(t("errors.saveFailed"));
            } finally {
              setSaving(false);
            }
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function RulesPage() {
  const { t } = useTranslation("rules");
  const { t: tc } = useTranslation("common");
  const queryClient = useQueryClient();
  const [documents, setDocuments] = useState<RuleDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<RuleType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<RuleItem["status"] | "all">(
    "all",
  );
  const [priorityFilter, setPriorityFilter] = useState<
    NonNullable<RuleItem["priority"]> | "all"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState<RuleWithType | null>(null);

  useEffect(() => {
    const load = async () => {
      const results: RuleDocument[] = [];
      for (const id of RULE_TYPES) {
        const res = await fetch(`/api/rules/${id}`);
        if (!res.ok) continue;
        const doc: RuleDocument = await res.json();
        doc.ruleType = id;
        results.push(doc);
      }
      setDocuments(results);
      setLoading(false);
    };
    load();
  }, []);

  const items = useMemo(
    () =>
      documents.flatMap((doc) =>
        doc.items.map((item) => ({ ...item, ruleType: doc.ruleType })),
      ),
    [documents],
  );

  const categories = useMemo(
    () => uniqueSorted(items.map((item) => item.category ?? "general")),
    [items],
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      if (typeFilter !== "all" && item.ruleType !== typeFilter) return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      const effectivePriority = item.priority ?? "p2";
      if (priorityFilter !== "all" && effectivePriority !== priorityFilter) {
        return false;
      }
      const categoryValue = item.category ?? "general";
      if (categoryFilter !== "all" && categoryValue !== categoryFilter) {
        return false;
      }
      if (!normalizedQuery) return true;
      const haystack = [
        item.text,
        item.title,
        item.description,
        item.key,
        categoryValue,
        item.status,
        effectivePriority,
        item.ruleType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [items, query, typeFilter, statusFilter, priorityFilter, categoryFilter]);

  const handleSave = async (updated: RuleWithType) => {
    const ruleType = updated.ruleType;
    if (!ruleType) throw new Error("Missing rule type");

    const doc = documents.find((entry) => entry.ruleType === ruleType);
    if (!doc) throw new Error("Document not found");

    const { ruleType: _, ...cleanedItem } = updated;
    const nextDoc: RuleDocument = {
      ...doc,
      items: doc.items.map((item) =>
        item.id === cleanedItem.id ? cleanedItem : item,
      ),
    };
    const payload = { ...nextDoc } as RuleDocument & { ruleType?: RuleType };
    delete payload.ruleType;

    const res = await fetch(`/api/rules/${ruleType}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to save");

    const saved: RuleDocument = await res.json();
    saved.ruleType = ruleType;
    setDocuments((prev) =>
      prev.map((entry) => (entry.ruleType === ruleType ? saved : entry)),
    );

    // Update selected item with new data
    setSelectedItem({ ...cleanedItem, ruleType });
    await invalidateDashboardData(queryClient);
  };

  const handleDelete = async (target: RuleWithType) => {
    const ruleType = target.ruleType;
    if (!ruleType) throw new Error("Missing rule type");

    await deleteRule(ruleType, target.id);
    setDocuments((prev) =>
      prev.map((doc) =>
        doc.ruleType !== ruleType
          ? doc
          : {
              ...doc,
              updatedAt: new Date().toISOString(),
              items: doc.items.filter((item) => item.id !== target.id),
            },
      ),
    );
    setSelectedItem(null);
    await invalidateDashboardData(queryClient);
  };

  const hasFilters =
    query.trim().length > 0 ||
    typeFilter !== "all" ||
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    categoryFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setTypeFilter("all");
    setStatusFilter("all");
    setPriorityFilter("all");
    setCategoryFilter("all");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("count", { filtered: filtered.length, total: items.length })}
        </p>
      </div>

      {/* Explanation Card */}
      {items.length === 0 && !loading && (
        <Card className="border-dashed">
          <CardContent className="py-6">
            <h3 className="font-medium mb-2">{t("explanation.title")}</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>
                <strong>dev-rules</strong>: {t("explanation.devRules")}
              </li>
              <li>
                <strong>review-guidelines</strong>:{" "}
                {t("explanation.reviewGuidelines")}
              </li>
            </ul>
            <p className="text-sm text-muted-foreground mt-3">
              <Trans
                i18nKey="explanation.description"
                ns="rules"
                components={{
                  code: <code className="bg-muted px-1 rounded" />,
                }}
              />
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3 items-center">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-64"
        />
        <Select
          value={typeFilter}
          onValueChange={(value) => setTypeFilter(value as RuleType | "all")}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={tc("allTypes")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tc("allTypes")}</SelectItem>
            {RULE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(value) =>
            setStatusFilter(value as RuleItem["status"] | "all")
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={tc("allStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tc("allStatus")}</SelectItem>
            <SelectItem value="active">{t("status.active")}</SelectItem>
            <SelectItem value="deprecated">{t("status.deprecated")}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={priorityFilter}
          onValueChange={(value) =>
            setPriorityFilter(
              value as NonNullable<RuleItem["priority"]> | "all",
            )
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("allPriority")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allPriority")}</SelectItem>
            <SelectItem value="p0">p0</SelectItem>
            <SelectItem value="p1">p1</SelectItem>
            <SelectItem value="p2">p2</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("allCategories")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allCategories")}</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            {tc("reset")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardContent className="p-3">
                <div className="h-4 bg-stone-200 dark:bg-stone-700 rounded w-full mb-2 animate-pulse" />
                <div className="h-3 bg-stone-200 dark:bg-stone-700 rounded w-24 animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {items.length === 0 ? t("noRules") : t("noMatchingFilters")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => (
            <RuleCard
              key={item.id}
              item={item}
              onClick={() => setSelectedItem(item)}
            />
          ))}
        </div>
      )}

      <RuleDetailDialog
        item={selectedItem}
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
