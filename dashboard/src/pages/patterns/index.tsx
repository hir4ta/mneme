import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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

function PatternCard({
  pattern,
  onClick,
}: {
  pattern: Pattern;
  onClick: () => void;
}) {
  const { t, i18n } = useTranslation("patterns");
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
    <Card
      className={`${colors.border} border hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors cursor-pointer h-full`}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <CardTitle className="text-sm font-medium line-clamp-2">
            {pattern.title ||
              pattern.description ||
              pattern.errorPattern ||
              pattern.solution ||
              "Untitled"}
          </CardTitle>
        </div>
        <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400 mb-2">
          <Badge className={`${colors.bg} ${colors.text} border-0 text-xs`}>
            {typeLabels[pattern.type] || pattern.type}
          </Badge>
          <span>{date}</span>
        </div>
        {pattern.tags && pattern.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pattern.tags.slice(0, 3).map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="text-xs px-1.5 py-0"
              >
                {tag}
              </Badge>
            ))}
            {pattern.tags.length > 3 && (
              <Badge variant="outline" className="text-xs px-1.5 py-0">
                +{pattern.tags.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PatternDetailDialog({
  pattern,
  open,
  onOpenChange,
}: {
  pattern: Pattern | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("patterns");

  if (!pattern) return null;

  const colors = typeColors[pattern.type] || typeColors.good;
  const typeLabels: Record<string, string> = {
    good: t("types.good"),
    bad: t("types.bad"),
    "error-solution": t("types.errorSolution"),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl max-h-[80vh] overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Badge className={`${colors.bg} ${colors.text} border-0`}>
              {typeLabels[pattern.type] || pattern.type}
            </Badge>
          </div>
          <DialogTitle className="mt-2">
            {pattern.title ||
              pattern.description ||
              pattern.errorPattern ||
              pattern.solution ||
              "Untitled"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Description (if different from title) */}
          {pattern.title && pattern.description !== pattern.title && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide">
                {t("fields.description")}
              </span>
              <p className="text-sm leading-relaxed">{pattern.description}</p>
            </div>
          )}

          {/* Error Pattern (for error-solution type) */}
          {pattern.type === "error-solution" && pattern.errorPattern && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-rose-600 dark:text-rose-400 uppercase tracking-wide">
                {t("fields.errorPattern")}
              </span>
              <pre className="text-xs bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 p-3 rounded overflow-x-auto whitespace-pre-wrap border border-rose-200 dark:border-rose-800">
                {pattern.errorPattern}
              </pre>
            </div>
          )}

          {/* Solution (for error-solution type) */}
          {pattern.type === "error-solution" && pattern.solution && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                {t("fields.solution")}
              </span>
              <pre className="text-xs bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 p-3 rounded overflow-x-auto whitespace-pre-wrap border border-emerald-200 dark:border-emerald-800">
                {pattern.solution}
              </pre>
            </div>
          )}

          {/* Code Example */}
          {pattern.codeExample && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide">
                {t("fields.codeExample")}
              </span>
              <pre className="text-xs bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 p-3 rounded overflow-x-auto whitespace-pre-wrap border border-stone-300 dark:border-stone-600">
                {pattern.codeExample}
              </pre>
            </div>
          )}

          {/* Context */}
          {pattern.context && (
            <div className="space-y-1">
              <span className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide">
                {t("fields.context")}
              </span>
              <pre className="text-xs bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 p-3 rounded overflow-x-auto whitespace-pre-wrap border border-stone-300 dark:border-stone-600">
                {pattern.context}
              </pre>
            </div>
          )}

          {/* Tags */}
          {pattern.tags && pattern.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2">
              {pattern.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
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
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);

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
      pattern.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pattern.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pattern.errorPattern?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pattern.solution?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = filterType === "all" || pattern.type === filterType;

    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("patternCount", { count: patterns.length })}
        </p>
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardContent className="p-3">
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-3 w-24 mb-2" />
                <Skeleton className="h-3 w-16" />
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredPatterns.map((pattern) => (
            <PatternCard
              key={pattern.id}
              pattern={pattern}
              onClick={() => setSelectedPattern(pattern)}
            />
          ))}
        </div>
      )}

      <PatternDetailDialog
        pattern={selectedPattern}
        open={!!selectedPattern}
        onOpenChange={(open) => !open && setSelectedPattern(null)}
      />
    </div>
  );
}
