import { Bot, Play, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import type { InteractionFromSQLite } from "@/lib/api";
import { agentToken, compactToken, planToken } from "@/lib/brand-colors";
import { formatDateTime } from "@/lib/format-date";
import {
  ProgressEventsSection,
  ThinkingSection,
  ToolDetailsSection,
  ToolResultsSection,
} from "./interaction-sections";

export interface ParsedCommand {
  isCommand: boolean;
  commandName?: string;
  commandArgs?: string;
  originalText: string;
}

export function parseCommandMessage(text: string): ParsedCommand {
  const commandNameMatch = text.match(/<command-name>([^<]+)<\/command-name>/);
  const commandArgsMatch = text.match(/<command-args>([^<]*)<\/command-args>/);

  if (commandNameMatch) {
    return {
      isCommand: true,
      commandName: commandNameMatch[1].trim(),
      commandArgs: commandArgsMatch?.[1]?.trim() || "",
      originalText: text,
    };
  }

  return { isCommand: false, originalText: text };
}

function CommandBadge({
  commandName,
  commandArgs,
}: {
  commandName: string;
  commandArgs: string;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 font-mono text-sm text-stone-300">
      <span className="text-stone-400">$</span>
      <span className="text-white font-medium">{commandName}</span>
      {commandArgs && <span className="text-stone-400">{commandArgs}</span>}
    </div>
  );
}

function stripSystemReminders(content: string): string {
  return content
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .trim();
}

function useBrandStyle(token: {
  light: { border: string; bg: string; text: string; badge: string };
  dark: { border: string; bg: string; text: string; badge: string };
}) {
  const isDark =
    typeof window !== "undefined" &&
    document.documentElement.classList.contains("dark");
  return isDark ? token.dark : token.light;
}

export function InteractionCard({
  interaction,
}: {
  interaction: InteractionFromSQLite;
}) {
  const { t } = useTranslation("sessions");
  const [isExpanded, setIsExpanded] = useState(false);
  const [isContinuationExpanded, setIsContinuationExpanded] = useState(false);
  const agentStyle = useBrandStyle(agentToken);
  const planStyle = useBrandStyle(planToken);
  const compactStyle = useBrandStyle(compactToken);

  const timestamp = formatDateTime(interaction.timestamp);
  const hasThinking =
    interaction.thinking && interaction.thinking.trim() !== "";
  const hasToolDetails =
    interaction.toolDetails && interaction.toolDetails.length > 0;
  const hasToolResults =
    interaction.toolResults && interaction.toolResults.length > 0;
  const filteredProgressEvents = interaction.progressEvents?.filter(
    (e) => e.type !== "hook_progress",
  );
  const hasProgressEvents =
    filteredProgressEvents && filteredProgressEvents.length > 0;
  const isSubagent = !!interaction.agentId;
  const isInPlanMode = interaction.inPlanMode || interaction.hasPlanMode;
  const isContinuation = interaction.isContinuation;

  const userContent = stripSystemReminders(interaction.user);
  const parsedCommand = parseCommandMessage(userContent);

  return (
    <div className="space-y-3">
      {/* Timestamp header with optional subagent badge */}
      <div className="flex justify-center items-center gap-2">
        <span className="text-xs text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-full">
          {timestamp}
        </span>
        {isSubagent && (
          <span
            className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1 font-medium"
            style={{
              border: `1px solid ${agentStyle.border}`,
              backgroundColor: agentStyle.badge,
              color: agentStyle.text,
            }}
          >
            <Bot className="w-3 h-3" />
            {interaction.agentType || "Agent"}
          </span>
        )}
      </div>

      {/* User message - right aligned (skip for continuation) */}
      {isContinuation ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setIsContinuationExpanded(!isContinuationExpanded)}
            className="text-xs px-3 py-1.5 rounded-full flex items-center gap-2 transition-colors cursor-pointer"
            style={{
              border: `1px solid ${compactStyle.border}`,
              backgroundColor: compactStyle.badge,
              color: compactStyle.text,
            }}
          >
            <Play className="w-3 h-3" />
            <span className="font-medium">
              {t("interaction.continuation", "Plan Implementation")}
            </span>
            <span className="ml-1">{isContinuationExpanded ? "▲" : "▼"}</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-end">
          <span className="text-xs text-stone-500 dark:text-stone-400 mb-1 mr-1">
            {t("interaction.user")}
          </span>
          {parsedCommand.isCommand ? (
            <div className="max-w-[85%] bg-stone-800/80 backdrop-blur rounded-lg px-3 py-1.5 shadow-sm border border-stone-700/50">
              <CommandBadge
                commandName={parsedCommand.commandName || ""}
                commandArgs={parsedCommand.commandArgs || ""}
              />
            </div>
          ) : (
            <div className="max-w-[85%] bg-[#39414B] text-white rounded-2xl rounded-br-sm px-4 py-2 shadow-sm">
              <MarkdownRenderer
                content={userContent}
                variant="dark"
                className="text-sm text-white prose-headings:text-white prose-strong:text-white"
              />
            </div>
          )}
        </div>
      )}

      {/* Plan mode indicator */}
      {isInPlanMode && (
        <div className="flex justify-center">
          <div
            className="text-xs px-3 py-1.5 rounded-full flex items-center gap-2"
            style={{
              border: `1px solid ${planStyle.border}`,
              backgroundColor: planStyle.badge,
              color: planStyle.text,
            }}
          >
            <Search className="w-3 h-3" />
            <span className="font-medium">{t("interaction.planMode")}</span>
            {interaction.planTools && interaction.planTools.length > 0 && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span style={{ opacity: 0.7 }}>
                  {interaction.planTools
                    .slice(0, 3)
                    .map((pt) => `${pt.name}×${pt.count}`)
                    .join(", ")}
                  {interaction.planTools.length > 3 && "..."}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Assistant response + details (hidden for collapsed continuation) */}
      {(!isContinuation || isContinuationExpanded) && (
        <>
          {interaction.assistant && (
            <div className="flex flex-col items-start">
              <span className="text-xs text-stone-500 dark:text-stone-400 mb-1 ml-1">
                {t("interaction.assistant")}
              </span>
              <div className="max-w-[85%] bg-[#F5F5F0] dark:bg-stone-800 text-stone-800 dark:text-stone-100 rounded-2xl rounded-bl-sm px-4 py-2 shadow-sm border border-stone-200 dark:border-stone-700">
                <MarkdownRenderer
                  content={
                    interaction.assistant.length > 500 && !isExpanded
                      ? `${interaction.assistant.substring(0, 500)}...`
                      : interaction.assistant
                  }
                  className="text-sm"
                />
                {interaction.assistant.length > 500 && !isExpanded && (
                  <button
                    type="button"
                    onClick={() => setIsExpanded(true)}
                    className="text-xs text-[#C15F3C] hover:underline mt-2"
                  >
                    {t("interaction.showMore")}
                  </button>
                )}
              </div>
            </div>
          )}

          {hasThinking && <ThinkingSection interaction={interaction} />}
          {hasToolDetails && <ToolDetailsSection interaction={interaction} />}
          {hasToolResults && <ToolResultsSection interaction={interaction} />}
          {hasProgressEvents && (
            <ProgressEventsSection
              filteredProgressEvents={filteredProgressEvents}
            />
          )}
        </>
      )}
    </div>
  );
}
