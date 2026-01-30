import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface Pattern {
  id: string;
  type: "good" | "bad" | "error-solution";
  title?: string;
  description: string;
  errorPattern?: string;
  solution?: string;
  codeExample?: string;
  context?: string;
  tags?: string[];
  sourceId?: string;
  sourceFile?: string;
  createdAt: string;
  updatedAt?: string;
}

interface PatternsResponse {
  patterns: Pattern[];
}

interface PatternStats {
  total: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
}

async function fetchPatterns(): Promise<PatternsResponse> {
  const res = await fetch("/api/patterns");
  if (!res.ok) throw new Error("Failed to fetch patterns");
  return res.json();
}

async function fetchPatternStats(): Promise<PatternStats> {
  const res = await fetch("/api/patterns/stats");
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

const typeColors: Record<string, { bg: string; text: string; border: string }> =
  {
    good: {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      text: "text-emerald-700 dark:text-emerald-300",
      border: "border-emerald-200 dark:border-emerald-800",
    },
    bad: {
      bg: "bg-rose-50 dark:bg-rose-950/30",
      text: "text-rose-700 dark:text-rose-300",
      border: "border-rose-200 dark:border-rose-800",
    },
    "error-solution": {
      bg: "bg-amber-50 dark:bg-amber-950/30",
      text: "text-amber-700 dark:text-amber-300",
      border: "border-amber-200 dark:border-amber-800",
    },
  };

function PatternCard({ pattern }: { pattern: Pattern }) {
  const { t, i18n } = useTranslation("patterns");
  const [isExpanded, setIsExpanded] = useState(false);
  const colors = typeColors[pattern.type] || typeColors.good;
  const date = new Date(pattern.createdAt).toLocaleDateString(
    i18n.language === "ja" ? "ja-JP" : "en-US",
  );

  const typeLabels: Record<string, string> = {
    good: t("types.good"),
    bad: t("types.bad"),
    "error-solution": t("types.errorSolution"),
  };

  return (
    <Card className={`${colors.bg} ${colors.border} border`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-medium line-clamp-2">
              {pattern.title || pattern.description}
            </CardTitle>
            <div className="flex items-center gap-2 mt-2 text-xs text-stone-500 dark:text-stone-400">
              <Badge className={`${colors.bg} ${colors.text} border-0`}>
                {typeLabels[pattern.type] || pattern.type}
              </Badge>
              <span>{date}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {pattern.type === "error-solution" && (
          <div className="space-y-3 mt-2">
            {pattern.errorPattern && (
              <div>
                <div className="text-xs font-medium text-rose-600 dark:text-rose-400 mb-1">
                  {t("fields.errorPattern")}
                </div>
                <pre className="text-xs bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 p-2 rounded overflow-x-auto whitespace-pre-wrap border border-rose-200 dark:border-rose-800">
                  {pattern.errorPattern}
                </pre>
              </div>
            )}
            {pattern.solution && (
              <div>
                <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">
                  {t("fields.solution")}
                </div>
                <pre className="text-xs bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 p-2 rounded overflow-x-auto whitespace-pre-wrap border border-emerald-200 dark:border-emerald-800">
                  {pattern.solution}
                </pre>
              </div>
            )}
          </div>
        )}

        {pattern.context && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer mt-2"
          >
            {isExpanded
              ? `▼ ${t("fields.hideContext")}`
              : `▶ ${t("fields.showContext")}`}
          </button>
        )}

        {isExpanded && pattern.context && (
          <div className="mt-2">
            <pre className="text-xs bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 p-2 rounded overflow-x-auto whitespace-pre-wrap">
              {pattern.context}
            </pre>
          </div>
        )}

        {pattern.tags && pattern.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {pattern.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({
  title,
  value,
  color,
}: {
  title: string;
  value: number;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="text-2xl font-bold" style={{ color }}>
          {value}
        </div>
        <div className="text-xs text-stone-500 dark:text-stone-400">
          {title}
        </div>
      </CardContent>
    </Card>
  );
}

export function PatternsPage() {
  const { t } = useTranslation("patterns");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  const {
    data: patternsData,
    isLoading: patternsLoading,
    error: patternsError,
  } = useQuery({
    queryKey: ["patterns"],
    queryFn: fetchPatterns,
  });

  const {
    data: statsData,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery({
    queryKey: ["patterns", "stats"],
    queryFn: fetchPatternStats,
  });

  if (patternsError || statsError) {
    return (
      <div className="text-center py-12 text-destructive">
        {t("errors:failedToLoad.patterns")}
      </div>
    );
  }

  // Filter patterns
  const patterns = patternsData?.patterns || [];
  const filteredPatterns = patterns.filter((pattern) => {
    const matchesSearch =
      searchQuery === "" ||
      pattern.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pattern.errorPattern?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pattern.solution?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = filterType === "all" || pattern.type === filterType;

    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Explanation */}
      {patterns.length === 0 && !patternsLoading && (
        <Card className="border-dashed">
          <CardContent className="py-6">
            <h3 className="font-medium mb-2">{t("explanation.title")}</h3>
            <div className="text-sm text-muted-foreground space-y-2">
              <div className="flex items-start gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-green-500 mt-1 shrink-0" />
                <div>
                  <strong>{t("types.good")}</strong>:{" "}
                  {t("explanation.goodPattern")}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-red-500 mt-1 shrink-0" />
                <div>
                  <strong>{t("types.bad")}</strong>:{" "}
                  {t("explanation.antiPattern")}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-amber-500 mt-1 shrink-0" />
                <div>
                  <strong>{t("types.errorSolution")}</strong>:{" "}
                  {t("explanation.errorSolution")}
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              <Trans
                i18nKey="explanation.description"
                ns="patterns"
                components={{
                  code: <code className="bg-muted px-1 rounded" />,
                }}
              />
            </p>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {statsLoading ? (
          [0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <Skeleton className="h-8 w-12 mb-1" />
                <Skeleton className="h-4 w-20" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              title={t("stats.totalPatterns")}
              value={statsData?.total || 0}
            />
            <StatCard
              title={t("stats.goodPatterns")}
              value={statsData?.byType?.good || 0}
              color="#16a34a"
            />
            <StatCard
              title={t("stats.antiPatterns")}
              value={statsData?.byType?.bad || 0}
              color="#dc2626"
            />
            <StatCard
              title={t("stats.errorSolutions")}
              value={statsData?.byType?.["error-solution"] || 0}
              color="#d97706"
            />
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <Input
          placeholder={t("searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("types.allTypes")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("types.allTypes")}</SelectItem>
            <SelectItem value="good">{t("types.goodPatterns")}</SelectItem>
            <SelectItem value="bad">{t("types.antiPatterns")}</SelectItem>
            <SelectItem value="error-solution">
              {t("types.errorSolutions")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Patterns List */}
      {patternsLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-20 mb-2" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredPatterns.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {patterns.length === 0 ? t("noPatterns") : t("noMatchingFilters")}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredPatterns.map((pattern) => (
            <PatternCard key={pattern.id} pattern={pattern} />
          ))}
        </div>
      )}
    </div>
  );
}
