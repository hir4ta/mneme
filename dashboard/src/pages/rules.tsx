import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { RuleDocument, RuleItem } from "@/types/rules";

const RULE_TYPES = ["dev-rules", "review-guidelines"] as const;
type RuleType = (typeof RULE_TYPES)[number];

type RuleDraft = RuleItem;

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

export function RulesPage() {
  const { t } = useTranslation("rules");
  const { t: tc } = useTranslation("common");
  const [documents, setDocuments] = useState<RuleDocument[]>([]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<RuleType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<RuleItem["status"] | "all">(
    "all",
  );
  const [priorityFilter, setPriorityFilter] = useState<
    NonNullable<RuleItem["priority"]> | "all"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const startEdit = (item: RuleItem & { ruleType?: RuleType }) => {
    setError(null);
    setEditingId(item.id);
    setDraft({
      ...item,
      status: item.status ?? "active",
      priority: item.priority ?? "p2",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const updateDraft = <K extends keyof RuleDraft>(
    key: K,
    value: RuleDraft[K],
  ) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const saveEdit = async () => {
    if (!draft) return;
    const ruleType = draft.ruleType;
    if (!ruleType) {
      setError("Missing rule type for update.");
      return;
    }
    const doc = documents.find((entry) => entry.ruleType === ruleType);
    if (!doc) {
      setError("Rules document not found.");
      return;
    }
    const trimmedText = draft.text.trim();
    if (!trimmedText) {
      setError("Rule text cannot be empty.");
      return;
    }

    setSavingId(draft.id);
    setError(null);
    try {
      const { ruleType: _, ...rest } = draft;
      const cleanedCategory = rest.category?.trim() || undefined;
      const cleanedRationale = rest.rationale?.trim() || undefined;
      const updatedItem: RuleItem = {
        ...rest,
        text: trimmedText,
        category: cleanedCategory,
        rationale: cleanedRationale,
        confidence: "manual",
        updatedAt: new Date().toISOString(),
      };

      const nextDoc: RuleDocument = {
        ...doc,
        items: doc.items.map((item) =>
          item.id === updatedItem.id ? updatedItem : item,
        ),
      };
      const payload = { ...nextDoc } as RuleDocument & { ruleType?: RuleType };
      delete payload.ruleType;

      const res = await fetch(`/api/rules/${ruleType}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error("Failed to save rule");
      }
      const saved: RuleDocument = await res.json();
      saved.ruleType = ruleType;
      setDocuments((prev) =>
        prev.map((entry) => (entry.ruleType === ruleType ? saved : entry)),
      );
      cancelEdit();
    } catch {
      setError("Failed to update rule. Please try again.");
    } finally {
      setSavingId(null);
    }
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
      {items.length === 0 && (
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

      <div className="space-y-3">
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
              <SelectItem value="deprecated">
                {t("status.deprecated")}
              </SelectItem>
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
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {items.length === 0 ? t("noRules") : t("noMatchingFilters")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => {
            const isEditing = editingId === item.id;
            const isSaving = savingId === item.id;
            const isLocked = editingId !== null && editingId !== item.id;
            const effectivePriority = item.priority ?? "p2";
            const categoryValue = item.category ?? "general";
            const currentDraft = isEditing ? draft : null;
            const displayText =
              isEditing && currentDraft ? currentDraft.text : item.text;
            const fieldIdBase = `rule-${item.id}`;

            return (
              <Card key={item.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base font-medium">
                        {displayText}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant={priorityColors[effectivePriority]}>
                          {effectivePriority}
                        </Badge>
                        <Badge
                          variant={statusColors[item.status] ?? "secondary"}
                        >
                          {item.status}
                        </Badge>
                        <span className="text-xs text-stone-500 dark:text-stone-400">
                          {item.ruleType}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            onClick={saveEdit}
                            disabled={isSaving}
                          >
                            {isSaving ? tc("saving") : tc("save")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                            disabled={isSaving}
                          >
                            {tc("cancel")}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(item)}
                          disabled={isLocked}
                        >
                          {tc("edit")}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-3">
                  {isEditing && currentDraft ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label
                          htmlFor={`${fieldIdBase}-text`}
                          className="text-xs text-muted-foreground"
                        >
                          {t("fields.text")}
                        </label>
                        <Textarea
                          id={`${fieldIdBase}-text`}
                          className="mt-1 min-h-[80px]"
                          value={currentDraft.text}
                          onChange={(e) => updateDraft("text", e.target.value)}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`${fieldIdBase}-priority`}
                          className="text-xs text-muted-foreground"
                        >
                          {t("fields.priority")}
                        </label>
                        <Select
                          value={currentDraft.priority ?? "p2"}
                          onValueChange={(value) =>
                            updateDraft(
                              "priority",
                              value as NonNullable<RuleItem["priority"]>,
                            )
                          }
                        >
                          <SelectTrigger className="mt-1 w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="p0">p0</SelectItem>
                            <SelectItem value="p1">p1</SelectItem>
                            <SelectItem value="p2">p2</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label
                          htmlFor={`${fieldIdBase}-category`}
                          className="text-xs text-muted-foreground"
                        >
                          {t("fields.category")}
                        </label>
                        <Input
                          id={`${fieldIdBase}-category`}
                          value={currentDraft.category ?? ""}
                          onChange={(e) =>
                            updateDraft("category", e.target.value)
                          }
                          placeholder="general"
                          className="mt-1"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label
                          htmlFor={`${fieldIdBase}-rationale`}
                          className="text-xs text-muted-foreground"
                        >
                          {t("fields.rationale")}
                        </label>
                        <Textarea
                          id={`${fieldIdBase}-rationale`}
                          className="mt-1 min-h-[60px]"
                          value={currentDraft.rationale ?? ""}
                          onChange={(e) =>
                            updateDraft("rationale", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <span className="text-muted-foreground">
                          {t("fields.category")}:
                        </span>{" "}
                        {categoryValue}
                      </div>
                      {item.rationale && (
                        <div>
                          <span className="text-muted-foreground">
                            {t("fields.rationale")}:
                          </span>{" "}
                          {item.rationale}
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
