import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { RuleDocument, RuleItem } from "@/types/rules";

const RULE_TYPES = ["dev-rules", "review-guidelines"] as const;
type RuleType = (typeof RULE_TYPES)[number];

type RuleDraft = Omit<RuleItem, "tags" | "appliesTo" | "exceptions"> & {
  tagsText: string;
  appliesToText: string;
  exceptionsText: string;
};

const formatDate = (value?: string) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ja-JP");
};

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

const parseList = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const uniqueSorted = (values: string[]) =>
  Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

export function RulesPage() {
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
  const [scopeFilter, setScopeFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
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
  const scopes = useMemo(
    () => uniqueSorted(items.map((item) => item.scope ?? "general")),
    [items],
  );
  const tags = useMemo(
    () => uniqueSorted(items.flatMap((item) => item.tags ?? [])),
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
      const scopeValue = item.scope ?? "general";
      if (scopeFilter !== "all" && scopeValue !== scopeFilter) {
        return false;
      }
      if (tagFilter !== "all" && !(item.tags ?? []).includes(tagFilter)) {
        return false;
      }
      if (!normalizedQuery) return true;
      const haystack = [
        item.text,
        item.key,
        categoryValue,
        scopeValue,
        item.status,
        effectivePriority,
        item.ruleType,
        ...(item.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [
    items,
    query,
    typeFilter,
    statusFilter,
    priorityFilter,
    categoryFilter,
    scopeFilter,
    tagFilter,
  ]);

  const renderChips = (values?: string[]) => {
    if (!values || values.length === 0) return <span>—</span>;
    return (
      <div className="flex flex-wrap gap-1">
        {values.map((value) => (
          <Badge key={value} variant="outline" className="text-xs">
            {value}
          </Badge>
        ))}
      </div>
    );
  };

  const startEdit = (item: RuleItem & { ruleType?: RuleType }) => {
    setError(null);
    setEditingId(item.id);
    setDraft({
      ...item,
      tagsText: (item.tags ?? []).join(", "),
      appliesToText: (item.appliesTo ?? []).join(", "),
      exceptionsText: (item.exceptions ?? []).join(", "),
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
      const {
        tagsText,
        appliesToText,
        exceptionsText,
        ruleType: _,
        ...rest
      } = draft;
      const tagsValue = parseList(tagsText);
      const appliesToValue = parseList(appliesToText);
      const exceptionsValue = parseList(exceptionsText);
      const cleanedCategory = rest.category?.trim() || undefined;
      const cleanedScope = rest.scope?.trim() || undefined;
      const cleanedRationale = rest.rationale?.trim() || undefined;
      const updatedItem: RuleItem = {
        ...rest,
        text: trimmedText,
        category: cleanedCategory,
        scope: cleanedScope,
        rationale: cleanedRationale,
        tags: tagsValue.length ? tagsValue : undefined,
        appliesTo: appliesToValue.length ? appliesToValue : undefined,
        exceptions: exceptionsValue.length ? exceptionsValue : undefined,
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
    categoryFilter !== "all" ||
    scopeFilter !== "all" ||
    tagFilter !== "all";

  const clearFilters = () => {
    setQuery("");
    setTypeFilter("all");
    setStatusFilter("all");
    setPriorityFilter("all");
    setCategoryFilter("all");
    setScopeFilter("all");
    setTagFilter("all");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rules</h1>
          <p className="text-sm text-muted-foreground">
            Review guidelines and development rules generated from sessions and
            decisions.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {items.length} rules
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-3 items-center">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rules..."
            className="w-64"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as RuleType | "all")}
            className="border border-border/70 bg-white/80 rounded-sm px-3 py-2 text-sm"
          >
            <option value="all">All Types</option>
            {RULE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as RuleItem["status"] | "all")
            }
            className="border border-border/70 bg-white/80 rounded-sm px-3 py-2 text-sm"
          >
            <option value="all">All Status</option>
            <option value="active">active</option>
            <option value="deprecated">deprecated</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) =>
              setPriorityFilter(
                e.target.value as NonNullable<RuleItem["priority"]> | "all",
              )
            }
            className="border border-border/70 bg-white/80 rounded-sm px-3 py-2 text-sm"
          >
            <option value="all">All Priority</option>
            <option value="p0">p0</option>
            <option value="p1">p1</option>
            <option value="p2">p2</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border border-border/70 bg-white/80 rounded-sm px-3 py-2 text-sm"
          >
            <option value="all">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="border border-border/70 bg-white/80 rounded-sm px-3 py-2 text-sm"
          >
            <option value="all">All Scopes</option>
            {scopes.map((scope) => (
              <option key={scope} value={scope}>
                {scope}
              </option>
            ))}
          </select>
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="border border-border/70 bg-white/80 rounded-sm px-3 py-2 text-sm"
          >
            <option value="all">All Tags</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Reset
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {items.length === 0
              ? "No rules yet."
              : "No rules match your filters."}
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
            const scopeValue = item.scope ?? "general";
            const currentDraft = isEditing ? draft : null;
            const displayText =
              isEditing && currentDraft ? currentDraft.text : item.text;
            const fieldIdBase = `rule-${item.id}`;

            return (
              <Card key={item.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-base font-medium flex items-center gap-2">
                      {displayText}
                      <Badge variant={priorityColors[effectivePriority]}>
                        {effectivePriority}
                      </Badge>
                      <Badge variant={statusColors[item.status] ?? "secondary"}>
                        {item.status}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {item.ruleType}
                      </Badge>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            onClick={saveEdit}
                            disabled={isSaving}
                          >
                            {isSaving ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEdit}
                            disabled={isSaving}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(item)}
                          disabled={isLocked}
                        >
                          Edit
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
                          Text
                        </label>
                        <textarea
                          id={`${fieldIdBase}-text`}
                          className="mt-1 w-full min-h-[80px] rounded-lg border border-border/70 bg-white/80 px-3 py-2 text-sm"
                          value={currentDraft.text}
                          onChange={(e) => updateDraft("text", e.target.value)}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`${fieldIdBase}-status`}
                          className="text-xs text-muted-foreground"
                        >
                          Status
                        </label>
                        <select
                          id={`${fieldIdBase}-status`}
                          value={currentDraft.status}
                          onChange={(e) =>
                            updateDraft(
                              "status",
                              e.target.value as RuleItem["status"],
                            )
                          }
                          className="mt-1 w-full border border-border/70 bg-white/80 rounded-sm px-3 py-2 text-sm"
                        >
                          <option value="active">active</option>
                          <option value="deprecated">deprecated</option>
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor={`${fieldIdBase}-priority`}
                          className="text-xs text-muted-foreground"
                        >
                          Priority
                        </label>
                        <select
                          id={`${fieldIdBase}-priority`}
                          value={currentDraft.priority ?? "p2"}
                          onChange={(e) =>
                            updateDraft(
                              "priority",
                              e.target.value as NonNullable<
                                RuleItem["priority"]
                              >,
                            )
                          }
                          className="mt-1 w-full border border-border/70 bg-white/80 rounded-sm px-3 py-2 text-sm"
                        >
                          <option value="p0">p0</option>
                          <option value="p1">p1</option>
                          <option value="p2">p2</option>
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor={`${fieldIdBase}-category`}
                          className="text-xs text-muted-foreground"
                        >
                          Category
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
                      <div>
                        <label
                          htmlFor={`${fieldIdBase}-scope`}
                          className="text-xs text-muted-foreground"
                        >
                          Scope
                        </label>
                        <Input
                          id={`${fieldIdBase}-scope`}
                          value={currentDraft.scope ?? ""}
                          onChange={(e) => updateDraft("scope", e.target.value)}
                          placeholder="general"
                          className="mt-1"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label
                          htmlFor={`${fieldIdBase}-tags`}
                          className="text-xs text-muted-foreground"
                        >
                          Tags (comma separated)
                        </label>
                        <Input
                          id={`${fieldIdBase}-tags`}
                          value={currentDraft.tagsText}
                          onChange={(e) =>
                            updateDraft("tagsText", e.target.value)
                          }
                          className="mt-1"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label
                          htmlFor={`${fieldIdBase}-rationale`}
                          className="text-xs text-muted-foreground"
                        >
                          Rationale
                        </label>
                        <textarea
                          id={`${fieldIdBase}-rationale`}
                          className="mt-1 w-full min-h-[60px] rounded-lg border border-border/70 bg-white/80 px-3 py-2 text-sm"
                          value={currentDraft.rationale ?? ""}
                          onChange={(e) =>
                            updateDraft("rationale", e.target.value)
                          }
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label
                          htmlFor={`${fieldIdBase}-applies-to`}
                          className="text-xs text-muted-foreground"
                        >
                          Applies To (comma separated)
                        </label>
                        <Input
                          id={`${fieldIdBase}-applies-to`}
                          value={currentDraft.appliesToText}
                          onChange={(e) =>
                            updateDraft("appliesToText", e.target.value)
                          }
                          className="mt-1"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label
                          htmlFor={`${fieldIdBase}-exceptions`}
                          className="text-xs text-muted-foreground"
                        >
                          Exceptions (comma separated)
                        </label>
                        <Input
                          id={`${fieldIdBase}-exceptions`}
                          value={currentDraft.exceptionsText}
                          onChange={(e) =>
                            updateDraft("exceptionsText", e.target.value)
                          }
                          className="mt-1"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-muted-foreground">
                            Category:
                          </span>{" "}
                          {categoryValue}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Scope:</span>{" "}
                          {scopeValue}
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Last Seen:
                          </span>{" "}
                          {formatDate(item.lastSeenAt)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            Occurrences:
                          </span>{" "}
                          {item.occurrences ?? 1}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tags:</span>{" "}
                        {renderChips(item.tags)}
                      </div>
                      {item.rationale && (
                        <div>
                          <span className="text-muted-foreground">
                            Rationale:
                          </span>{" "}
                          {item.rationale}
                        </div>
                      )}
                      {item.appliesTo && item.appliesTo.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">
                            Applies To:
                          </span>{" "}
                          {renderChips(item.appliesTo)}
                        </div>
                      )}
                      {item.exceptions && item.exceptions.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">
                            Exceptions:
                          </span>{" "}
                          {renderChips(item.exceptions)}
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
