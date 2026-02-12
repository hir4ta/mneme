import { BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Session } from "@/lib/types";
import {
  CodeExamplesSection,
  DiscussionsSection,
  ErrorsSection,
  FilesModifiedSection,
  HandoffSection,
  PlanSection,
  ReferencesSection,
  SectionCard,
  SummarySection,
  TechnologiesSection,
} from "./session-context-sections";

interface SessionContextCardProps {
  session: Session;
  embedded?: boolean; // If true, render without outer Card wrapper
}

export function SessionContextCard({
  session,
  embedded = false,
}: SessionContextCardProps) {
  const { t } = useTranslation("sessions");

  // Count available sections
  const sections = [
    session.summary && (session.summary.goal || session.summary.description),
    session.plan &&
      (session.plan.tasks?.length || session.plan.remaining?.length),
    session.discussions && session.discussions.length > 0,
    session.codeExamples && session.codeExamples.length > 0,
    session.errors && session.errors.length > 0,
    session.handoff &&
      (session.handoff.stoppedReason ||
        session.handoff.notes?.length ||
        session.handoff.nextSteps?.length),
    session.references && session.references.length > 0,
    session.technologies && session.technologies.length > 0,
    session.filesModified && session.filesModified.length > 0,
  ].filter(Boolean).length;

  if (sections === 0) {
    return null;
  }

  const headerContent = (
    <>
      <div className="text-lg flex items-center gap-2 font-semibold">
        <BookOpen className="h-5 w-5 text-muted-foreground" />
        {t("context.title")}
        <Badge variant="secondary" className="text-xs font-normal">
          {t("context.sections", { count: sections })}
        </Badge>
      </div>
      {session.summary?.sessionType && (
        <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-xs">
            {session.summary.sessionType}
          </Badge>
        </div>
      )}
    </>
  );

  const contentSections = (
    <div className="space-y-3">
      {session.summary &&
        (session.summary.goal ||
          session.summary.outcome ||
          session.summary.description) && (
          <SectionCard
            sectionKey="summary"
            label={t("context.sectionLabels.summary")}
          >
            <SummarySection summary={session.summary} t={t} />
          </SectionCard>
        )}

      {session.plan &&
        (session.plan.tasks?.length || session.plan.remaining?.length) && (
          <SectionCard
            sectionKey="plan"
            label={t("context.sectionLabels.plan")}
          >
            <PlanSection plan={session.plan} t={t} />
          </SectionCard>
        )}

      {session.discussions && session.discussions.length > 0 && (
        <SectionCard
          sectionKey="discussions"
          label={t("context.sectionLabels.discussions")}
        >
          <DiscussionsSection discussions={session.discussions} t={t} />
        </SectionCard>
      )}

      {session.codeExamples && session.codeExamples.length > 0 && (
        <SectionCard
          sectionKey="codeExamples"
          label={t("context.sectionLabels.code_examples")}
        >
          <CodeExamplesSection codeExamples={session.codeExamples} t={t} />
        </SectionCard>
      )}

      {session.errors && session.errors.length > 0 && (
        <SectionCard
          sectionKey="errors"
          label={t("context.sectionLabels.errors")}
        >
          <ErrorsSection errors={session.errors} t={t} />
        </SectionCard>
      )}

      {session.handoff &&
        (session.handoff.stoppedReason ||
          session.handoff.notes?.length ||
          session.handoff.nextSteps?.length) && (
          <SectionCard
            sectionKey="handoff"
            label={t("context.sectionLabels.handoff")}
          >
            <HandoffSection handoff={session.handoff} t={t} />
          </SectionCard>
        )}

      {session.references && session.references.length > 0 && (
        <SectionCard
          sectionKey="references"
          label={t("context.sectionLabels.references")}
        >
          <ReferencesSection references={session.references} />
        </SectionCard>
      )}

      {session.technologies && session.technologies.length > 0 && (
        <SectionCard
          sectionKey="technologies"
          label={t("context.sectionLabels.technologies")}
        >
          <TechnologiesSection technologies={session.technologies} />
        </SectionCard>
      )}

      {session.filesModified && session.filesModified.length > 0 && (
        <SectionCard
          sectionKey="filesModified"
          label={t("context.sectionLabels.filesModified")}
        >
          <FilesModifiedSection filesModified={session.filesModified} />
        </SectionCard>
      )}
    </div>
  );

  // Embedded mode: render without Card wrapper
  if (embedded) {
    return (
      <div className="space-y-4">
        <div className="pb-3">{headerContent}</div>
        {contentSections}
      </div>
    );
  }

  // Default: render with Card wrapper
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
          {t("context.title")}
          <Badge variant="secondary" className="text-xs font-normal">
            {t("context.sections", { count: sections })}
          </Badge>
        </CardTitle>
        {session.summary?.sessionType && (
          <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-xs">
              {session.summary.sessionType}
            </Badge>
          </div>
        )}
      </CardHeader>
      <CardContent>{contentSections}</CardContent>
    </Card>
  );
}
