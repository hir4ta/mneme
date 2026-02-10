import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { GuideNav } from "./components/guide-nav";

export function GuideWorkflowPage() {
  const { t } = useTranslation("guide");

  const phases = t("workflow.phases", { returnObjects: true }) as Array<{
    name: string;
    command: string | null;
    description: string;
    benefits: string[];
    example: string | null;
  }>;

  const dataFlowSteps = t("workflow.dataFlow.steps", {
    returnObjects: true,
  }) as Array<{
    event: string;
    action: string;
  }>;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">{t("workflow.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("workflow.subtitle")}
          </p>
        </div>

        <GuideNav />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pt-6 space-y-6">
        <p className="text-stone-600 dark:text-stone-300">
          {t("workflow.intro")}
        </p>

        {/* Phases */}
        <section className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {phases.map((phase, index) => (
              <Card key={phase.name} className="relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-stone-700 dark:bg-stone-600" />
                <CardContent className="p-4 pl-5">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-stone-700 text-white text-xs flex items-center justify-center">
                      {index + 1}
                    </span>
                    <h3 className="font-semibold">{phase.name}</h3>
                    {phase.command && (
                      <Badge variant="secondary" className="font-mono text-xs">
                        {phase.command}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {phase.description}
                  </p>
                  <ul className="space-y-1 mb-3">
                    {phase.benefits.map((benefit) => (
                      <li
                        key={benefit}
                        className="text-sm flex items-start gap-2"
                      >
                        <span className="text-green-600 dark:text-green-400 mt-0.5">
                          +
                        </span>
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                  {phase.example && (
                    <code className="block bg-stone-100 dark:bg-stone-800 px-2 py-1 rounded text-xs font-mono">
                      {phase.example}
                    </code>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Data Flow */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">
            {t("workflow.dataFlow.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("workflow.dataFlow.description")}
          </p>
          <div>
            {dataFlowSteps.map((step, index) => (
              <div key={step.event} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-white dark:bg-stone-900 border-2 border-stone-300 dark:border-stone-600 flex items-center justify-center text-xs font-medium shrink-0">
                    {index + 1}
                  </div>
                  {index < dataFlowSteps.length - 1 && (
                    <div className="w-0.5 flex-1 bg-stone-200 dark:bg-stone-700" />
                  )}
                </div>
                <div
                  className={`flex-1 ${index < dataFlowSteps.length - 1 ? "pb-6" : ""}`}
                >
                  <h4 className="font-medium text-sm">{step.event}</h4>
                  <p className="text-sm text-muted-foreground">{step.action}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
