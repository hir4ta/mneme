import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { GuideNav } from "./components/guide-nav";

export function GuidePage() {
  const { t } = useTranslation("guide");

  const features = t("overview.features.items", {
    returnObjects: true,
  }) as Array<{
    title: string;
    description: string;
  }>;

  const quickStartSteps = t("overview.quickStart.steps", {
    returnObjects: true,
  }) as Array<{
    title: string;
    description: string;
    code?: string;
  }>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("overview.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("overview.subtitle")}
        </p>
      </div>

      <GuideNav />

      {/* Description */}
      <p className="text-stone-600 dark:text-stone-300">
        {t("overview.description")}
      </p>

      {/* Features */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          {t("overview.features.title")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title}>
              <CardContent className="p-4">
                <h3 className="font-medium mb-1">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Quick Start */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          {t("overview.quickStart.title")}
        </h2>
        <div className="space-y-4">
          {quickStartSteps.map((step, index) => (
            <div key={step.title} className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-stone-800 dark:bg-stone-700 text-white flex items-center justify-center text-sm font-medium">
                {index + 1}
              </div>
              <div className="flex-1">
                <h3 className="font-medium">{step.title}</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  {step.description}
                </p>
                {step.code && (
                  <code className="block bg-stone-100 dark:bg-stone-800 px-3 py-2 rounded text-sm font-mono">
                    {step.code}
                  </code>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
