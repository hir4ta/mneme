import { Badge } from "@/components/ui/badge";
import type {
  SessionCodeExample,
  SessionError,
  SessionHandoff,
  SessionReference,
} from "@/lib/types";

export function CodeExamplesSection({
  codeExamples,
  t,
}: {
  codeExamples: SessionCodeExample[];
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-3">
      {codeExamples.map((example) => (
        <div
          key={`${example.file}-${example.description || ""}`}
          className="space-y-2"
        >
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-mono">
              {example.file}
            </Badge>
            {example.description && (
              <span className="text-xs text-muted-foreground">
                {example.description}
              </span>
            )}
          </div>
          {example.before && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                {t("context.fields.before")}:
              </div>
              <pre className="bg-muted p-2 rounded text-xs font-mono overflow-x-auto">
                {example.before}
              </pre>
            </div>
          )}
          {example.after && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                {t("context.fields.after")}:
              </div>
              <pre className="bg-muted p-2 rounded text-xs font-mono overflow-x-auto">
                {example.after}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ErrorsSection({
  errors,
  t,
}: {
  errors: SessionError[];
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-3">
      {errors.map((error) => (
        <div
          key={`${error.error}-${error.cause || ""}`}
          className="bg-destructive/10 border border-destructive/20 rounded p-3 space-y-2 text-sm"
        >
          <div className="font-mono text-xs text-destructive">
            {error.error}
          </div>
          {error.context && (
            <div className="text-xs">
              <span className="text-muted-foreground">
                {t("context.fields.context")}:{" "}
              </span>
              {error.context}
            </div>
          )}
          {error.cause && (
            <div className="text-xs">
              <span className="text-muted-foreground">
                {t("context.fields.cause")}:{" "}
              </span>
              {error.cause}
            </div>
          )}
          {error.solution && (
            <div className="text-xs text-green-600 dark:text-green-400">
              <span className="text-muted-foreground">
                {t("context.fields.solution")}:{" "}
              </span>
              {error.solution}
            </div>
          )}
          {error.files && error.files.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {error.files.map((file) => (
                <Badge
                  key={file}
                  variant="secondary"
                  className="text-xs font-mono"
                >
                  {file}
                </Badge>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function HandoffSection({
  handoff,
  t,
}: {
  handoff: SessionHandoff;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-2 text-sm">
      {handoff.stoppedReason && (
        <div>
          <span className="text-muted-foreground">
            {t("context.fields.stoppedReason")}:
          </span>{" "}
          <span>{handoff.stoppedReason}</span>
        </div>
      )}
      {handoff.notes && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            {t("context.fields.notes")}
          </div>
          {Array.isArray(handoff.notes) ? (
            handoff.notes.length > 0 && (
              <ul className="list-disc list-inside space-y-1">
                {handoff.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )
          ) : (
            <p className="whitespace-pre-wrap">{handoff.notes}</p>
          )}
        </div>
      )}
      {handoff.nextSteps && handoff.nextSteps.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1">
            {t("context.fields.nextSteps")}
          </div>
          <ul className="list-disc list-inside space-y-1 text-primary">
            {handoff.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ReferencesSection({
  references,
}: {
  references: (SessionReference | string)[];
}) {
  return (
    <div className="space-y-2">
      {references.map((ref) => {
        // Handle string references (legacy format)
        if (typeof ref === "string") {
          return (
            <div key={ref} className="flex items-start gap-2 text-sm">
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                {ref}
              </code>
            </div>
          );
        }
        // Handle object references
        return (
          <div
            key={`${ref.type || ""}-${ref.url || ref.path || ref.title || ""}`}
            className="flex items-start gap-2 text-sm"
          >
            {ref.type && (
              <Badge variant="outline" className="text-xs">
                {ref.type}
              </Badge>
            )}
            {ref.url ? (
              <a
                href={ref.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                {ref.title || ref.url}
              </a>
            ) : ref.path ? (
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                {ref.path}
              </code>
            ) : (
              ref.title
            )}
            {ref.description && (
              <span className="text-muted-foreground text-xs">
                - {ref.description}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TechnologiesSection({
  technologies,
}: {
  technologies: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {technologies.map((tech) => (
        <Badge key={tech} variant="secondary" className="text-xs">
          {tech}
        </Badge>
      ))}
    </div>
  );
}

export function FilesModifiedSection({
  filesModified,
}: {
  filesModified: Array<{ path: string; action: string }>;
}) {
  return (
    <div className="space-y-1 text-sm">
      {filesModified.map((file) => (
        <div
          key={`${file.path}-${file.action}`}
          className="flex items-center gap-2"
        >
          <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono truncate">
            {file.path}
          </code>
          <Badge variant="outline" className="text-xs shrink-0">
            {file.action}
          </Badge>
        </div>
      ))}
    </div>
  );
}
