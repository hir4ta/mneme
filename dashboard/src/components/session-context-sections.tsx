import {
  AlertTriangle,
  ArrowRightFromLine,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Code,
  FileText,
  Link,
  MessageSquare,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Badge } from "@/components/ui/badge";
import type {
  SessionDiscussion,
  SessionPlan,
  SessionSummary,
} from "@/lib/types";

// Re-export detail sections for consumers
export {
  CodeExamplesSection,
  ErrorsSection,
  FilesModifiedSection,
  HandoffSection,
  ReferencesSection,
  TechnologiesSection,
} from "./session-context-detail-sections";

// Section icons using lucide-react
export const sectionIcons: Record<string, ReactNode> = {
  summary: <FileText className="h-4 w-4" />,
  plan: <ClipboardList className="h-4 w-4" />,
  discussions: <MessageSquare className="h-4 w-4" />,
  codeExamples: <Code className="h-4 w-4" />,
  references: <Link className="h-4 w-4" />,
  handoff: <ArrowRightFromLine className="h-4 w-4" />,
  errors: <AlertTriangle className="h-4 w-4" />,
  technologies: <Code className="h-4 w-4" />,
  filesModified: <FileText className="h-4 w-4" />,
};

// Section colors (inline style values)
export const sectionColors: Record<string, string> = {
  summary: "#40513B",
  plan: "#40513B",
  discussions: "#628141",
  codeExamples: "#628141",
  references: "#E5D9B6",
  handoff: "#E67E22",
  errors: "#E67E22",
  technologies: "#2D8B7A",
  filesModified: "#628141",
};

export function SectionCard({
  sectionKey,
  label,
  children,
}: {
  sectionKey: string;
  label: string;
  children: ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const icon = sectionIcons[sectionKey] || <FileText className="h-4 w-4" />;
  const borderColor = sectionColors[sectionKey] || "#6b7280";

  return (
    <div
      className="border-l-4 bg-card rounded-r-lg shadow-sm overflow-hidden"
      style={{ borderLeftColor: borderColor }}
    >
      <button
        type="button"
        className="w-full px-4 py-3 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <span className="font-medium text-sm">{label}</span>
        </div>
        <span className="text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
      </button>
      {isExpanded && <div className="px-4 py-3">{children}</div>}
    </div>
  );
}

export function SummarySection({
  summary,
  t,
}: {
  summary: SessionSummary;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-2 text-sm">
      {summary.goal && (
        <div>
          <span className="text-muted-foreground">
            {t("context.fields.goal")}:
          </span>{" "}
          <span>{summary.goal}</span>
        </div>
      )}
      {summary.outcome && (
        <div>
          <span className="text-muted-foreground">
            {t("context.fields.outcome")}:
          </span>
          <p className="mt-1 whitespace-pre-wrap">{summary.outcome}</p>
        </div>
      )}
      {summary.description && (
        <div>
          <span className="text-muted-foreground">
            {t("context.fields.description")}:
          </span>
          <p className="mt-1 whitespace-pre-wrap">{summary.description}</p>
        </div>
      )}
      {summary.sessionType && (
        <div>
          <span className="text-muted-foreground">
            {t("context.fields.type")}:
          </span>{" "}
          <Badge variant="outline" className="text-xs">
            {summary.sessionType}
          </Badge>
        </div>
      )}
    </div>
  );
}

export function PlanSection({
  plan,
  t,
}: {
  plan: SessionPlan;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-3 text-sm">
      {plan.goals && plan.goals.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            {t("context.fields.goals")}
          </div>
          <ul className="list-disc list-inside space-y-1">
            {plan.goals.map((goal) => (
              <li key={goal}>{goal}</li>
            ))}
          </ul>
        </div>
      )}
      {plan.tasks && plan.tasks.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            {t("context.fields.tasks")}
          </div>
          <ul className="space-y-1 font-mono text-xs">
            {plan.tasks.map((task) => (
              <li
                key={task}
                className={
                  task.startsWith("[x]")
                    ? "text-green-600 dark:text-green-400"
                    : ""
                }
              >
                {task}
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan.remaining && plan.remaining.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            {t("context.fields.remaining")}
          </div>
          <ul className="list-disc list-inside space-y-1 text-orange-600 dark:text-orange-400">
            {plan.remaining.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function DiscussionsSection({
  discussions,
  t,
}: {
  discussions: SessionDiscussion[];
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-3">
      {discussions.map((discussion) => (
        <div
          key={`${discussion.topic}-${discussion.decision}`}
          className="bg-muted/30 rounded p-3 space-y-2 text-sm"
        >
          <div className="font-medium">{discussion.topic}</div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {t("context.fields.decision")}:
            </span>
            <Badge variant="default" className="text-xs">
              {discussion.decision}
            </Badge>
          </div>
          {discussion.reasoning && (
            <div className="text-muted-foreground text-xs">
              {discussion.reasoning}
            </div>
          )}
          {discussion.alternatives && discussion.alternatives.length > 0 && (
            <div className="text-xs">
              <span className="text-muted-foreground">
                {t("context.fields.alternatives")}:{" "}
              </span>
              {discussion.alternatives.join(", ")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
