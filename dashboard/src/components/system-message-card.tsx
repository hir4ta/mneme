import { Bot, CheckCircle, Terminal, XCircle } from "lucide-react";
import { useState } from "react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import type { InteractionFromSQLite } from "@/lib/api";
import {
  brand,
  brandExtended,
  errorToken,
  toolDetailToken,
} from "@/lib/brand-colors";
import { formatDateTime } from "@/lib/format-date";

// --- Detection ---

export type SystemMessageType = "teammate" | "task-notification" | null;

function stripSystemReminders(content: string): string {
  return content
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .trim();
}

export function detectSystemMessage(content: string): SystemMessageType {
  const stripped = stripSystemReminders(content);
  if (stripped.startsWith("<teammate-message")) return "teammate";
  if (stripped.startsWith("<task-notification")) return "task-notification";
  return null;
}

// --- Teammate color tokens (brand-based, muted) ---

interface StyleToken {
  border: string;
  bg: string;
  text: string;
  badge: string;
}

function makeStylePair(
  hex: string,
  darkText: string,
): { light: StyleToken; dark: StyleToken } {
  return {
    light: {
      border: hex,
      bg: `${hex}14`,
      text: hex,
      badge: `${hex}26`,
    },
    dark: {
      border: `${hex}66`,
      bg: `${hex}1A`,
      text: darkText,
      badge: `${hex}33`,
    },
  };
}

const TEAMMATE_TOKENS: Record<string, { light: StyleToken; dark: StyleToken }> =
  {
    blue: makeStylePair(brand.pattern, "#5BB8A6"),
    purple: makeStylePair(brandExtended.purple, "#A596B6"),
    green: makeStylePair(brand.decision, "#8FB368"),
    yellow: makeStylePair(brand.rule, "#E6994D"),
  };

const DEFAULT_TEAMMATE_TOKEN = makeStylePair(brand.session, "#7A9B6B");

// --- Teammate message parsing ---

interface TeammateMessage {
  teammateId: string;
  color?: string;
  summary?: string;
  content: string;
}

function parseTeammateMessages(raw: string): TeammateMessage[] {
  const stripped = stripSystemReminders(raw);
  const results: TeammateMessage[] = [];
  const regex = /<teammate-message\s+([^>]*)>([\s\S]*?)<\/teammate-message>/g;

  for (const match of stripped.matchAll(regex)) {
    const attrs = match[1];
    const content = match[2].trim();

    const idMatch = attrs.match(/teammate_id="([^"]+)"/);
    const colorMatch = attrs.match(/color="([^"]+)"/);
    const summaryMatch = attrs.match(/summary="([^"]+)"/);

    if (isJsonSystemMessage(content)) continue;
    if (idMatch?.[1] === "system") continue;

    results.push({
      teammateId: idMatch?.[1] || "unknown",
      color: colorMatch?.[1],
      summary: summaryMatch?.[1],
      content,
    });
  }

  return results;
}

function isJsonSystemMessage(content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    return typeof parsed === "object" && parsed !== null && "type" in parsed;
  } catch {
    return false;
  }
}

// --- Task notification parsing ---

interface TaskNotification {
  taskId: string;
  status: string;
  summary: string;
  result: string;
  usage?: string;
  transcriptPath?: string;
}

function parseTaskNotification(raw: string): TaskNotification | null {
  const stripped = stripSystemReminders(raw);
  const notifMatch = stripped.match(
    /<task-notification>([\s\S]*?)<\/task-notification>/,
  );
  if (!notifMatch) return null;

  const inner = notifMatch[1];
  const taskId = inner.match(/<task-id>([^<]*)<\/task-id>/)?.[1]?.trim() || "";
  const status = inner.match(/<status>([^<]*)<\/status>/)?.[1]?.trim() || "";
  const summary = inner.match(/<summary>([^<]*)<\/summary>/)?.[1]?.trim() || "";
  const resultMatch = inner.match(/<result>([\s\S]*?)<\/result>/);
  const result = resultMatch?.[1]?.trim() || "";
  const usageMatch = inner.match(/<usage>([\s\S]*?)<\/usage>/);
  const usage = usageMatch?.[1]?.trim();

  const afterNotif = stripped
    .slice((notifMatch.index || 0) + notifMatch[0].length)
    .trim();
  const transcriptPath = afterNotif.startsWith("Full transcript")
    ? afterNotif
    : undefined;

  return { taskId, status, summary, result, usage, transcriptPath };
}

// --- Dark mode detection ---

function useIsDark(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

// --- Components ---

function TeammateMessageCard({ msg }: { msg: TeammateMessage }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isDark = useIsDark();
  const token = msg.color
    ? TEAMMATE_TOKENS[msg.color] || DEFAULT_TEAMMATE_TOKEN
    : DEFAULT_TEAMMATE_TOKEN;
  const s = isDark ? token.dark : token.light;
  const needsExpand = msg.content.length > 300;

  return (
    <div
      className="rounded-xl p-4"
      style={{
        border: `1px solid ${s.border}`,
        backgroundColor: s.bg,
        color: s.text,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ backgroundColor: s.badge, color: s.text }}
        >
          <Bot className="w-3 h-3" />
          {msg.teammateId}
        </span>
        {msg.summary && (
          <span className="text-xs opacity-70 truncate">{msg.summary}</span>
        )}
      </div>
      <div className="text-sm text-stone-700 dark:text-stone-300">
        <MarkdownRenderer
          content={
            needsExpand && !isExpanded
              ? `${msg.content.substring(0, 300)}...`
              : msg.content
          }
          className="prose-sm"
        />
        {needsExpand && !isExpanded && (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="text-xs underline mt-2"
            style={{ color: s.text }}
          >
            Show more
          </button>
        )}
      </div>
    </div>
  );
}

function TaskNotificationCard({ notif }: { notif: TaskNotification }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isDark = useIsDark();
  const isCompleted = notif.status === "completed";

  const successToken = isDark ? toolDetailToken.dark : toolDetailToken.light;
  const failToken = isDark ? errorToken.dark : errorToken.light;
  const s = isCompleted ? successToken : failToken;

  return (
    <div
      className="rounded-xl p-4"
      style={{
        border: `1px solid ${s.border}`,
        backgroundColor: s.bg,
        color: s.text,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ backgroundColor: s.badge, color: s.text }}
        >
          {isCompleted ? (
            <CheckCircle className="w-3 h-3" />
          ) : (
            <XCircle className="w-3 h-3" />
          )}
          {notif.status}
        </span>
        {notif.taskId && (
          <span className="text-xs font-mono opacity-50">{notif.taskId}</span>
        )}
      </div>
      <p className="text-sm font-medium mb-2 text-stone-700 dark:text-stone-300">
        {notif.summary}
      </p>
      {notif.result && (
        <>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs underline opacity-70 hover:opacity-100"
            style={{ color: s.text }}
          >
            {isExpanded ? "Hide details" : "Show details"}
          </button>
          {isExpanded && (
            <div className="mt-3 text-sm max-h-96 overflow-y-auto text-stone-700 dark:text-stone-300">
              <MarkdownRenderer content={notif.result} className="prose-sm" />
            </div>
          )}
        </>
      )}
      {notif.usage && (
        <div className="mt-2 text-xs font-mono opacity-40 flex items-center gap-1">
          <Terminal className="w-3 h-3" />
          {notif.usage
            .split("\n")
            .filter((l) => l.trim())
            .join(" | ")}
        </div>
      )}
    </div>
  );
}

// --- Main component ---

export function SystemMessageCard({
  interaction,
  type,
}: {
  interaction: InteractionFromSQLite;
  type: SystemMessageType;
}) {
  const timestamp = formatDateTime(interaction.timestamp);

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <span className="text-xs text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 px-2 py-0.5 rounded-full">
          {timestamp}
        </span>
      </div>

      <div className="flex flex-col items-start">
        {type === "teammate" && <TeammateMessages raw={interaction.user} />}
        {type === "task-notification" && (
          <TaskNotificationMessage raw={interaction.user} />
        )}
      </div>

      {interaction.assistant && (
        <div className="flex flex-col items-start">
          <span className="text-xs text-stone-500 dark:text-stone-400 mb-1 ml-1">
            Assistant
          </span>
          <div className="max-w-[85%] bg-[#F5F5F0] dark:bg-stone-800 text-stone-800 dark:text-stone-100 rounded-2xl rounded-bl-sm px-4 py-2 shadow-sm border border-stone-200 dark:border-stone-700">
            <MarkdownRenderer
              content={interaction.assistant}
              className="text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TeammateMessages({ raw }: { raw: string }) {
  const messages = parseTeammateMessages(raw);
  if (messages.length === 0) return null;

  return (
    <div className="max-w-[85%] space-y-2">
      {messages.map((msg, i) => (
        <TeammateMessageCard key={`tm-${i}-${msg.teammateId}`} msg={msg} />
      ))}
    </div>
  );
}

function TaskNotificationMessage({ raw }: { raw: string }) {
  const notif = parseTaskNotification(raw);
  if (!notif) return null;

  return (
    <div className="max-w-[85%]">
      <TaskNotificationCard notif={notif} />
    </div>
  );
}
