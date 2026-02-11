import { Zap } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import type { InteractionFromSQLite } from "@/lib/api";
import { compactToken } from "@/lib/brand-colors";
import { formatDateTime } from "@/lib/format-date";

function useIsDark(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

export function CompactSummaryCard({
  interaction,
}: {
  interaction: InteractionFromSQLite;
}) {
  const { t } = useTranslation("sessions");
  const [isExpanded, setIsExpanded] = useState(false);
  const timestamp = formatDateTime(interaction.timestamp);
  const isDark = useIsDark();
  const s = isDark ? compactToken.dark : compactToken.light;

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs px-3 py-1.5 rounded-full flex items-center gap-2 transition-colors cursor-pointer"
          style={{
            border: `1px solid ${s.border}`,
            backgroundColor: s.badge,
            color: s.text,
          }}
        >
          <Zap className="w-3 h-3" />
          <span className="font-medium">
            {t("interaction.contextCompacted")}
          </span>
          <span style={{ opacity: 0.5 }}>·</span>
          <span style={{ opacity: 0.7 }}>{timestamp}</span>
          <span className="ml-1">{isExpanded ? "▲" : "▼"}</span>
        </button>
      </div>

      {isExpanded && (
        <div
          className="mx-4 rounded-xl p-4"
          style={{
            backgroundColor: s.bg,
            border: `1px solid ${s.border}`,
          }}
        >
          <div className="text-xs font-medium mb-2" style={{ color: s.text }}>
            {t("interaction.summaryFromPreviousContext")}
          </div>
          <div className="text-xs max-h-96 overflow-y-auto">
            <MarkdownRenderer
              content={interaction.user}
              className="text-stone-700 dark:text-stone-300"
            />
          </div>
        </div>
      )}
    </div>
  );
}
