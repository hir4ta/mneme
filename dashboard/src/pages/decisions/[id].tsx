import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { Badge } from "@/components/ui/badge";
import { getDecision } from "@/lib/api";
import type { Decision } from "@/lib/types";

export function DecisionDetailPage() {
  const { t } = useTranslation("decisions");
  const { t: tc } = useTranslation("common");
  const { id } = useParams<{ id: string }>();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getDecision(id)
      .then((data) => {
        setDecision(data);
        setError(null);
      })
      .catch(() => setError("Failed to load decision"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="text-center py-12">{tc("loading")}</div>;
  }

  if (error || !decision) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">
          {error || t("errors:decisionNotFound")}
        </p>
        <Link to="/decisions" className="text-primary underline mt-4 block">
          {t("errors:backToDecisions")}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/decisions"
          className="text-muted-foreground hover:text-foreground"
        >
          &larr; {tc("back")}
        </Link>
      </div>

      <div className="space-y-6">
        {/* Title */}
        <h2 className="text-xl font-semibold">{decision.title}</h2>

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
        {decision.alternatives.length > 0 && (
          <div className="space-y-1">
            <span className="text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wide">
              {t("detail.alternatives")}
            </span>
            <div className="space-y-2">
              {decision.alternatives.map((alt) => (
                <div
                  key={`${alt.name}-${alt.reason}`}
                  className="border border-stone-300 dark:border-stone-600 rounded px-4 py-3"
                >
                  <span className="font-medium text-sm">{alt.name}</span>
                  <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
                    {alt.reason}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {decision.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-2">
            {decision.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
