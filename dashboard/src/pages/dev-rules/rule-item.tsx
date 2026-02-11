import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { DevRuleItem } from "@/lib/api";
import { typeColors } from "@/pages/graph/types";

type DevRuleStatus = DevRuleItem["status"];

export const statusVariant: Record<
  DevRuleStatus,
  "default" | "secondary" | "destructive"
> = {
  draft: "secondary",
  approved: "default",
  rejected: "destructive",
};

export function TypeBadge({ type }: { type: string }) {
  const { t } = useTranslation("devRules");
  const color = typeColors[type] || typeColors.unknown;
  const label = t(`type.${type}`, type);
  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium"
      style={{
        color,
        borderColor: `${color}50`,
        backgroundColor: `${color}15`,
      }}
    >
      {label}
    </span>
  );
}

export function RuleItem({
  item,
  onStatusChange,
  onRequestDelete,
  onClick,
  selected,
  onSelect,
}: {
  item: DevRuleItem;
  onStatusChange: (item: DevRuleItem, status: DevRuleStatus) => Promise<void>;
  onRequestDelete: (item: DevRuleItem) => void;
  onClick: (item: DevRuleItem) => void;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
}) {
  const { t } = useTranslation("devRules");
  const [processing, setProcessing] = useState(false);

  return (
    <Card className="hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors h-full">
      <CardContent className="px-3 py-2.5 h-full flex flex-col">
        <div className="flex items-start gap-2.5 flex-1">
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onSelect(item.id, checked === true)}
            className="mt-1"
            aria-label={t("ariaSelectItem", { title: item.title })}
          />
          <button
            type="button"
            className="flex-1 min-w-0 cursor-pointer text-left bg-transparent border-0 p-0"
            onClick={() => onClick(item)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 min-w-0">
                <p className="font-medium leading-tight">{item.title}</p>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {item.summary}
                </p>
              </div>
              <Badge variant={statusVariant[item.status] || "default"}>
                {t(`status.${item.status}`, item.status)}
              </Badge>
            </div>
          </button>
        </div>

        <div className="flex items-end justify-between gap-3 pl-6.5 mt-2">
          <div className="flex flex-wrap gap-1">
            <TypeBadge type={item.type} />
            {item.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
            {item.tags.length > 4 && (
              <Badge variant="secondary">+{item.tags.length - 4}</Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0 justify-end">
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
      </CardContent>
    </Card>
  );
}
