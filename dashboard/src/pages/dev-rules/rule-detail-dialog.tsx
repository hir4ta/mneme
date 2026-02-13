import {
  AlertTriangle,
  BookOpen,
  GitFork,
  Lightbulb,
  Link2,
  MessageSquare,
  ScrollText,
  Shield,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DevRuleItem } from "@/lib/api";
import { formatDate } from "@/lib/format-date";
import { typeColors } from "@/pages/graph/types";
import { statusVariant, TypeBadge } from "./rule-item";

type DevRuleStatus = DevRuleItem["status"];

function DetailSection({
  icon,
  label,
  accentColor,
  children,
}: {
  icon: ReactNode;
  label: string;
  accentColor: string;
  children: ReactNode;
}) {
  return (
    <div
      className="border-l-4 bg-card rounded-r-lg shadow-sm overflow-hidden"
      style={{ borderLeftColor: accentColor }}
    >
      <div className="px-4 py-2.5 flex items-center gap-2 bg-muted/30">
        <span className="text-muted-foreground">{icon}</span>
        <span className="font-medium text-xs uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function DecisionDetails({
  item,
  accentColor,
}: {
  item: DevRuleItem;
  accentColor: string;
}) {
  const { t } = useTranslation("devRules");

  const hasContent =
    item.context || item.reasoning || item.alternatives?.length;
  if (!hasContent) return null;

  return (
    <DetailSection
      icon={<MessageSquare className="h-4 w-4" />}
      label={t("detail.decisionDetail")}
      accentColor={accentColor}
    >
      <div className="space-y-3 text-sm">
        {item.context && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              {t("detail.context")}
            </div>
            <p className="whitespace-pre-wrap">{item.context}</p>
          </div>
        )}
        {item.reasoning && (
          <div
            className="rounded p-3 space-y-1.5"
            style={{ backgroundColor: `${accentColor}10` }}
          >
            <div className="flex items-center gap-1.5">
              <Lightbulb
                className="h-3.5 w-3.5"
                style={{ color: accentColor }}
              />
              <span className="text-xs text-muted-foreground">
                {t("detail.reasoning")}
              </span>
            </div>
            <p className="whitespace-pre-wrap">{item.reasoning}</p>
          </div>
        )}
        {item.alternatives && item.alternatives.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-2">
              {t("detail.alternatives")}
            </div>
            <div className="space-y-1.5">
              {item.alternatives.map((alt) => (
                <div
                  key={alt}
                  className="flex items-start gap-2 rounded px-3 py-2 text-xs bg-muted/40"
                >
                  <GitFork className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <span className="whitespace-pre-wrap">{alt}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DetailSection>
  );
}

function PatternDetails({
  item,
  accentColor,
}: {
  item: DevRuleItem;
  accentColor: string;
}) {
  const { t } = useTranslation("devRules");

  const hasContent = item.pattern || item.context || item.patternType;
  if (!hasContent) return null;

  return (
    <DetailSection
      icon={<BookOpen className="h-4 w-4" />}
      label={t("detail.patternDetail")}
      accentColor={accentColor}
    >
      <div className="space-y-3 text-sm">
        {item.patternType && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("detail.patternType")}:
            </span>
            <span
              className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
              style={{
                color: accentColor,
                borderColor: `${accentColor}60`,
                backgroundColor: `${accentColor}15`,
              }}
            >
              {item.patternType}
            </span>
          </div>
        )}
        {item.context && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              {t("detail.context")}
            </div>
            <p className="whitespace-pre-wrap">{item.context}</p>
          </div>
        )}
        {item.pattern && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              {t("detail.pattern")}
            </div>
            <pre
              className="p-3 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap"
              style={{
                backgroundColor: `${accentColor}12`,
                borderLeft: `3px solid ${accentColor}40`,
              }}
            >
              {item.pattern}
            </pre>
          </div>
        )}
      </div>
    </DetailSection>
  );
}

function RuleDetails({
  item,
  accentColor,
}: {
  item: DevRuleItem;
  accentColor: string;
}) {
  const { t } = useTranslation("devRules");

  const hasContent = item.rationale || item.category;
  if (!hasContent) return null;

  return (
    <DetailSection
      icon={<Shield className="h-4 w-4" />}
      label={t("detail.ruleDetail")}
      accentColor={accentColor}
    >
      <div className="space-y-3 text-sm">
        {item.category && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("detail.category")}:
            </span>
            <span
              className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
              style={{
                color: accentColor,
                borderColor: `${accentColor}60`,
                backgroundColor: `${accentColor}15`,
              }}
            >
              {item.category}
            </span>
          </div>
        )}
        {item.rationale && (
          <div
            className="rounded p-3 space-y-1.5"
            style={{
              backgroundColor: `${accentColor}10`,
              border: `1px solid ${accentColor}20`,
            }}
          >
            <div className="flex items-center gap-1.5">
              <AlertTriangle
                className="h-3.5 w-3.5"
                style={{ color: accentColor }}
              />
              <span className="text-xs text-muted-foreground">
                {t("detail.rationale")}
              </span>
            </div>
            <p className="whitespace-pre-wrap">{item.rationale}</p>
          </div>
        )}
      </div>
    </DetailSection>
  );
}

export function RuleDetailDialog({
  item,
  open,
  onOpenChange,
  onStatusChange,
  onRequestDelete,
}: {
  item: DevRuleItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (item: DevRuleItem, status: DevRuleStatus) => Promise<void>;
  onRequestDelete: (item: DevRuleItem) => void;
}) {
  const { t } = useTranslation("devRules");
  const [processing, setProcessing] = useState(false);
  if (!item) return null;

  const accentColor = typeColors[item.type] || typeColors.unknown;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="mb-1">
            <TypeBadge type={item.type} />
          </div>
          <DialogTitle className="leading-snug">{item.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          {item.summary && (
            <DetailSection
              icon={<ScrollText className="h-4 w-4" />}
              label={t("detail.summary")}
              accentColor={accentColor}
            >
              <p className="text-sm whitespace-pre-wrap">{item.summary}</p>
            </DetailSection>
          )}

          {/* Type-specific details */}
          {item.type === "decision" && (
            <DecisionDetails item={item} accentColor={accentColor} />
          )}
          {item.type === "pattern" && (
            <PatternDetails item={item} accentColor={accentColor} />
          )}
          {item.type === "rule" && (
            <RuleDetails item={item} accentColor={accentColor} />
          )}

          {/* Metadata footer */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-3">
              <Badge variant={statusVariant[item.status] || "default"}>
                {t(`status.${item.status}`, item.status)}
              </Badge>
              {item.priority && (
                <Badge variant="outline" className="text-xs font-mono">
                  {item.priority}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground font-mono">
                {item.type}: {item.sourceFile}
              </span>
            </div>

            {item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>
                {t("detail.created")}: {formatDate(item.createdAt)}
              </span>
              {item.updatedAt && (
                <span>
                  {t("detail.updated")}: {formatDate(item.updatedAt)}
                </span>
              )}
            </div>

            {item.sessionRef && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  {t("detail.sourceSession")}:
                </span>
                <Link
                  to={`/sessions/${item.sessionRef}`}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-muted hover:bg-muted/80 rounded font-mono transition-colors"
                  onClick={() => onOpenChange(false)}
                >
                  <Link2 className="h-3 w-3" />
                  {item.sessionRef.slice(0, 8)}
                </Link>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                disabled={processing || item.status === "approved"}
                onClick={async () => {
                  setProcessing(true);
                  try {
                    await onStatusChange(item, "approved");
                  } finally {
                    setProcessing(false);
                  }
                }}
              >
                {t("actions.approve")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={processing || item.status === "rejected"}
                onClick={async () => {
                  setProcessing(true);
                  try {
                    await onStatusChange(item, "rejected");
                  } finally {
                    setProcessing(false);
                  }
                }}
              >
                {t("actions.reject")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive border-destructive/50 hover:text-destructive hover:bg-destructive/10"
                disabled={processing}
                onClick={() => onRequestDelete(item)}
              >
                {t("actions.delete")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
