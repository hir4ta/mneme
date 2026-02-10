import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GuideAccordion } from "./components/guide-accordion";
import { GuideNav } from "./components/guide-nav";

type FaqItem = {
  question: string;
  answer: string;
};

type FaqCategory = {
  title: string;
  items: FaqItem[];
};

export function GuideFaqPage() {
  const { t } = useTranslation("guide");
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  const categories = t("faq.categories", { returnObjects: true }) as Record<
    string,
    FaqCategory
  >;

  const toggleQuestion = (question: string) => {
    setExpandedQuestion(expandedQuestion === question ? null : question);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 space-y-6 pb-4">
        <div>
          <h1 className="text-2xl font-bold">{t("faq.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("faq.subtitle")}</p>
        </div>

        <GuideNav />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-6">
        {Object.entries(categories).map(([key, category]) => (
          <section key={key} className="space-y-3">
            <h2 className="text-lg font-semibold">{category.title}</h2>
            <div className="space-y-2">
              {category.items.map((item, itemIndex) => {
                const isExpanded = expandedQuestion === item.question;
                const faqId = `faq-${key}-${itemIndex}`;

                return (
                  <GuideAccordion
                    key={item.question}
                    id={faqId}
                    isExpanded={isExpanded}
                    onToggle={() => toggleQuestion(item.question)}
                    header={
                      <div className="flex items-start gap-3">
                        <span className="text-stone-400 dark:text-stone-500 shrink-0">
                          {t("common.question")}
                        </span>
                        <span className="font-medium">{item.question}</span>
                      </div>
                    }
                  >
                    <div className="flex gap-3">
                      <span className="text-green-600 dark:text-green-400 shrink-0">
                        {t("common.answer")}
                      </span>
                      <p className="text-sm text-muted-foreground">
                        {item.answer}
                      </p>
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
