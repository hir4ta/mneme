import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { GuideAccordion } from "./components/guide-accordion";
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

export function GuideCommandsPage() {
  const { t } = useTranslation("guide");
  const [expandedCommand, setExpandedCommand] = useState<string | null>(null);

  const categories = t("commands.categories", {
    returnObjects: true,
  }) as Record<string, CommandCategory>;

  const toggleCommand = (name: string) => {
    setExpandedCommand(expandedCommand === name ? null : name);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 space-y-6 pb-4">
        <div>
          <h1 className="text-2xl font-bold">{t("commands.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("commands.subtitle")}
          </p>
        </div>

        <GuideNav />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-6">
        {Object.entries(categories).map(([key, category]) => (
          <section key={key} className="space-y-3">
            <h2 className="text-lg font-semibold">{category.title}</h2>
            <div className="space-y-2">
              {category.commands.map((command) => {
                const isExpanded = expandedCommand === command.name;
                const commandId = `command-${command.name.replace(/[^a-zA-Z0-9]/g, "-")}`;

                return (
                  <GuideAccordion
                    key={command.name}
                    id={commandId}
                    isExpanded={isExpanded}
                    onToggle={() => toggleCommand(command.name)}
                    header={
                      <>
                        <div className="flex items-center gap-2 mb-1">
                          <code className="font-mono font-semibold text-sm">
                            {command.name}
                          </code>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {command.description}
                        </p>
                      </>
                    }
                  >
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
                              <li
                                key={phase}
                                className="text-sm flex items-start gap-2"
                              >
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
                  </GuideAccordion>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
