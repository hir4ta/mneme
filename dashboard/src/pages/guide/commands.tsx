import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GuideNav } from "./components/guide-nav";

type CommandOption = {
  name: string;
  description: string;
};

type Command = {
  name: string;
  description: string;
  usage: string;
  details: string;
  options: CommandOption[];
  phases?: string[];
};

type CommandCategory = {
  title: string;
  commands: Command[];
};

function CommandDetailDialog({
  command,
  open,
  onOpenChange,
}: {
  command: Command | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation("guide");
  if (!command) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono">{command.name}</DialogTitle>
          <DialogDescription>{command.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Usage */}
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("common.usage")}
            </span>
            <code className="block bg-stone-100 dark:bg-stone-800 px-3 py-2 rounded text-sm font-mono mt-1">
              {command.usage}
            </code>
          </div>

          {/* Details */}
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {t("common.details")}
            </span>
            <p className="text-sm mt-1">{command.details}</p>
          </div>

          {/* Options */}
          {command.options.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("common.options")}
              </span>
              <div className="mt-2 space-y-2">
                {command.options.map((option) => (
                  <div key={option.name} className="flex gap-2">
                    <Badge
                      variant="outline"
                      className="font-mono text-xs shrink-0"
                    >
                      {option.name}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {option.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phases */}
          {command.phases && command.phases.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("common.phases")}
              </span>
              <ol className="mt-2 space-y-1">
                {command.phases.map((phase, index) => (
                  <li key={phase} className="text-sm flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-stone-200 dark:bg-stone-700 text-xs flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <span>{phase}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GuideCommandsPage() {
  const { t } = useTranslation("guide");
  const [selectedCommand, setSelectedCommand] = useState<Command | null>(null);

  const categories = t("commands.categories", {
    returnObjects: true,
  }) as Record<string, CommandCategory>;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{t("commands.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("commands.subtitle")}
          </p>
        </div>

        <GuideNav />
      </div>

      {Object.entries(categories).map(([key, category]) => (
        <section key={key} className="space-y-3">
          <h2 className="text-lg font-semibold">{category.title}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {category.commands.map((command) => (
              <Card
                key={command.name}
                className="cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
                onClick={() => setSelectedCommand(command)}
              >
                <CardContent className="px-3 py-2.5">
                  <code className="font-mono font-semibold text-sm">
                    {command.name}
                  </code>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    {command.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <CommandDetailDialog
        command={selectedCommand}
        open={selectedCommand !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCommand(null);
        }}
      />
    </div>
  );
}
