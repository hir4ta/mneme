import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GuideAccordion } from "./components/guide-accordion";
import { GuideNav } from "./components/guide-nav";

type UseCaseStep = {
  action: string;
  result: string;
};

type UseCase = {
  title: string;
  scenario: string;
  steps: UseCaseStep[];
};

export function GuideUseCasesPage() {
  const { t } = useTranslation("guide");
  const [expandedCase, setExpandedCase] = useState<string | null>(null);

  const cases = t("useCases.cases", { returnObjects: true }) as UseCase[];

  const toggleCase = (title: string) => {
    setExpandedCase(expandedCase === title ? null : title);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 space-y-6 pb-4">
        <div>
          <h1 className="text-2xl font-bold">{t("useCases.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("useCases.subtitle")}
          </p>
        </div>

        <GuideNav />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-6">
        <div className="space-y-3">
          {cases.map((useCase, caseIndex) => {
            const isExpanded = expandedCase === useCase.title;
            const caseId = `usecase-${caseIndex}`;

            return (
              <GuideAccordion
                key={useCase.title}
                id={caseId}
                isExpanded={isExpanded}
                onToggle={() => toggleCase(useCase.title)}
                header={
                  <>
                    <h3 className="font-medium mb-1">{useCase.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {useCase.scenario}
                    </p>
                  </>
                }
              >
                <div className="space-y-3">
                  {useCase.steps.map((step, index) => (
                    <div key={step.action} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-stone-700 text-white text-xs flex items-center justify-center shrink-0">
                          {index + 1}
                        </div>
                        {index < useCase.steps.length - 1 && (
                          <div className="w-0.5 flex-1 bg-stone-200 dark:bg-stone-700 mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-2">
                        <p className="text-sm font-medium">{step.action}</p>
                        <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                          → {step.result}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </GuideAccordion>
            );
          })}
        </div>
      </div>
    </div>
  );
}
