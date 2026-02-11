import {
  Bot,
  Brain,
  CheckCircle,
  FileText,
  Play,
  XCircle,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import type { InteractionFromSQLite } from "@/lib/api";
import {
  errorToken,
  progressToken,
  thinkingToken,
  toolDetailToken,
  toolResultToken,
} from "@/lib/brand-colors";

function useIsDark(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

export function ThinkingSection({
  interaction,
}: {
  interaction: InteractionFromSQLite;
}) {
  const { t } = useTranslation("sessions");
  const [showThinking, setShowThinking] = useState(false);
  const isDark = useIsDark();
  const s = isDark ? thinkingToken.dark : thinkingToken.light;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <button
          type="button"
          onClick={() => setShowThinking(!showThinking)}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1 mb-1"
        >
          <Brain className="w-3 h-3" style={{ color: s.text }} />
          {showThinking
            ? t("interaction.hideThinking")
            : t("interaction.showThinking")}
        </button>

        {showThinking && (
          <div
            className="rounded-xl px-4 py-2"
            style={{
              backgroundColor: s.bg,
              border: `1px solid ${s.border}`,
            }}
          >
            <MarkdownRenderer
              content={interaction.thinking || ""}
              className="text-xs text-stone-700 dark:text-stone-300"
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function ToolDetailsSection({
  interaction,
}: {
  interaction: InteractionFromSQLite;
}) {
  const { t } = useTranslation("sessions");
  const [showToolDetails, setShowToolDetails] = useState(false);
  const isDark = useIsDark();
  const s = isDark ? toolDetailToken.dark : toolDetailToken.light;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <button
          type="button"
          onClick={() => setShowToolDetails(!showToolDetails)}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1 mb-1"
        >
          <Zap className="w-3 h-3" style={{ color: s.text }} />
          {showToolDetails
            ? t("interaction.hideToolDetails")
            : t("interaction.showToolDetails")}
          <span className="text-stone-400">
            ({interaction.toolDetails?.length})
          </span>
        </button>

        {showToolDetails && (
          <div
            className="rounded-xl px-3 py-2"
            style={{
              backgroundColor: s.bg,
              border: `1px solid ${s.border}`,
            }}
          >
            <div className="space-y-1 font-mono text-xs">
              {interaction.toolDetails?.map((tool, idx) => (
                <div
                  key={`${tool.name}-${idx}`}
                  className="flex items-start gap-2 text-stone-700 dark:text-stone-300"
                >
                  <span
                    className="font-semibold shrink-0"
                    style={{ color: s.text }}
                  >
                    {tool.name}
                  </span>
                  <span className="break-all opacity-80">
                    {typeof tool.detail === "string"
                      ? tool.detail.length > 80
                        ? `${tool.detail.substring(0, 80)}...`
                        : tool.detail
                      : tool.detail
                        ? JSON.stringify(tool.detail)
                        : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ToolResultsSection({
  interaction,
}: {
  interaction: InteractionFromSQLite;
}) {
  const { t } = useTranslation("sessions");
  const [showToolResults, setShowToolResults] = useState(false);
  const isDark = useIsDark();
  const s = isDark ? toolResultToken.dark : toolResultToken.light;
  const errS = isDark ? errorToken.dark : errorToken.light;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <button
          type="button"
          onClick={() => setShowToolResults(!showToolResults)}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1 mb-1"
        >
          <FileText className="w-3 h-3" style={{ color: s.text }} />
          {showToolResults
            ? t("interaction.hideToolResults")
            : t("interaction.showToolResults")}
          <span className="text-stone-400">
            ({interaction.toolResults?.length})
          </span>
        </button>

        {showToolResults && (
          <div
            className="rounded-xl px-3 py-2"
            style={{
              backgroundColor: s.bg,
              border: `1px solid ${s.border}`,
            }}
          >
            <div className="space-y-1 font-mono text-xs">
              {interaction.toolResults?.map((result, idx) => (
                <div
                  key={`${result.toolUseId}-${idx}`}
                  className="flex items-center gap-2 text-stone-700 dark:text-stone-300"
                >
                  {result.success ? (
                    <CheckCircle
                      className="w-3 h-3 shrink-0"
                      style={{ color: s.text }}
                    />
                  ) : (
                    <XCircle
                      className="w-3 h-3 shrink-0"
                      style={{ color: errS.text }}
                    />
                  )}
                  {result.toolName && (
                    <span className="font-semibold" style={{ color: s.text }}>
                      {result.toolName}
                    </span>
                  )}
                  <span className="opacity-80">
                    {result.filePath
                      ? result.filePath.split("/").pop()
                      : !result.toolName
                        ? result.toolUseId.slice(0, 12)
                        : null}
                  </span>
                  {result.lineCount && result.lineCount > 1 && (
                    <span style={{ color: s.text, opacity: 0.7 }}>
                      {result.lineCount} lines
                    </span>
                  )}
                  {result.contentLength != null && result.contentLength > 0 && (
                    <span style={{ color: s.text, opacity: 0.5 }}>
                      (
                      {result.contentLength < 1024
                        ? `${result.contentLength}B`
                        : `${Math.round(result.contentLength / 1024)}KB`}
                      )
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ProgressEventsSection({
  filteredProgressEvents,
}: {
  filteredProgressEvents: NonNullable<InteractionFromSQLite["progressEvents"]>;
}) {
  const { t } = useTranslation("sessions");
  const [showProgressEvents, setShowProgressEvents] = useState(false);
  const isDark = useIsDark();
  const s = isDark ? progressToken.dark : progressToken.light;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%]">
        <button
          type="button"
          onClick={() => setShowProgressEvents(!showProgressEvents)}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1 mb-1"
        >
          <Play className="w-3 h-3" style={{ color: s.text }} />
          {showProgressEvents
            ? t("interaction.hideProgressEvents")
            : t("interaction.showProgressEvents")}
          <span className="text-stone-400">
            ({filteredProgressEvents.length})
          </span>
        </button>

        {showProgressEvents && (
          <div
            className="rounded-xl px-3 py-2"
            style={{
              backgroundColor: s.bg,
              border: `1px solid ${s.border}`,
            }}
          >
            <div className="space-y-1 font-mono text-xs">
              {(() => {
                const agentGroups = new Map<
                  string,
                  { prompt?: string; count: number }
                >();
                const otherEvents: typeof filteredProgressEvents = [];

                for (const event of filteredProgressEvents) {
                  if (event.type === "agent_progress") {
                    const key = event.agentId || "_unknown";
                    const existing = agentGroups.get(key);
                    if (existing) {
                      existing.count++;
                    } else {
                      agentGroups.set(key, {
                        prompt: event.prompt,
                        count: 1,
                      });
                    }
                  } else {
                    otherEvents.push(event);
                  }
                }

                return (
                  <>
                    {Array.from(agentGroups.entries()).map(
                      ([agentId, { prompt, count }]) => (
                        <div
                          key={agentId}
                          className="flex items-start gap-2 text-stone-700 dark:text-stone-300"
                        >
                          <Bot
                            className="w-3 h-3 shrink-0 mt-0.5"
                            style={{ color: s.text }}
                          />
                          <span
                            className="font-semibold shrink-0"
                            style={{ color: s.text }}
                          >
                            {agentId === "_unknown"
                              ? "Agent"
                              : agentId.slice(0, 7)}
                          </span>
                          <span className="break-all opacity-80">
                            {prompt
                              ? prompt.length > 100
                                ? `${prompt.substring(0, 100)}...`
                                : prompt
                              : ""}
                          </span>
                          <span
                            className="shrink-0"
                            style={{ color: s.text, opacity: 0.6 }}
                          >
                            x{count}
                          </span>
                        </div>
                      ),
                    )}
                    {otherEvents.map((event, idx) => (
                      <div
                        key={`${event.timestamp}-${idx}`}
                        className="flex items-center gap-2 text-stone-700 dark:text-stone-300"
                      >
                        <span
                          className="font-semibold shrink-0"
                          style={{ color: s.text }}
                        >
                          {event.type === "mcp_progress" ? "MCP" : event.type}
                        </span>
                        <span className="opacity-80">
                          {event.toolName || ""}
                        </span>
                      </div>
                    ))}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
