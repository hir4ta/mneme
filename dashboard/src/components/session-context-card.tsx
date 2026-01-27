import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionMarkdown } from "@/lib/api";

interface SessionContextCardProps {
  sessionId: string;
}

// Parse MD into sections
function parseMarkdownSections(content: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = content.split("\n");

  let currentSection = "header";
  let currentContent: string[] = [];

  for (const line of lines) {
    // Check for h2 headers (## Section)
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      // Save previous section
      if (currentContent.length > 0) {
        sections[currentSection] = currentContent.join("\n").trim();
      }
      currentSection = h2Match[1].trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentContent.length > 0) {
    sections[currentSection] = currentContent.join("\n").trim();
  }

  return sections;
}

// Section icons
const sectionIcons: Record<string, string> = {
  "計画・タスク": "📋",
  議論の経緯: "💬",
  コード例: "💻",
  参照情報: "🔗",
  次回への引き継ぎ: "📌",
  "エラー・解決策": "🔧",
};

// Section colors
const sectionColors: Record<string, string> = {
  "計画・タスク": "border-l-blue-500",
  議論の経緯: "border-l-purple-500",
  コード例: "border-l-green-500",
  参照情報: "border-l-yellow-500",
  次回への引き継ぎ: "border-l-orange-500",
  "エラー・解決策": "border-l-red-500",
};

function SectionCard({ title, content }: { title: string; content: string }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const icon = sectionIcons[title] || "📄";
  const borderColor = sectionColors[title] || "border-l-gray-500";

  // Skip empty sections
  if (!content || content.trim() === "" || content.trim() === "---") {
    return null;
  }

  return (
    <div
      className={`border-l-4 ${borderColor} bg-card rounded-r-lg shadow-sm overflow-hidden`}
    >
      <button
        type="button"
        className="w-full px-4 py-3 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="font-medium text-sm">{title}</span>
        </div>
        <span className="text-muted-foreground text-xs">
          {isExpanded ? "▼" : "▶"}
        </span>
      </button>
      {isExpanded && (
        <div className="px-4 py-3 prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Custom table styling
              table: ({ children }) => (
                <div className="overflow-x-auto my-2">
                  <table className="min-w-full text-sm border-collapse">
                    {children}
                  </table>
                </div>
              ),
              th: ({ children }) => (
                <th className="border border-border bg-muted/50 px-3 py-2 text-left font-medium">
                  {children}
                </th>
              ),
              td: ({ children }) => (
                <td className="border border-border px-3 py-2">{children}</td>
              ),
              // Custom code block styling
              code: ({ className, children, ...props }) => {
                const isInline = !className;
                if (isInline) {
                  return (
                    <code
                      className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                }
                return (
                  <code
                    className={`block bg-muted p-3 rounded-lg text-xs font-mono overflow-x-auto ${className}`}
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
              pre: ({ children }) => (
                <pre className="bg-muted rounded-lg overflow-hidden my-2">
                  {children}
                </pre>
              ),
              // Custom list styling
              ul: ({ children }) => (
                <ul className="list-disc list-inside space-y-1 my-2">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal list-inside space-y-1 my-2">
                  {children}
                </ol>
              ),
              // Custom heading styling (h3, h4 within sections)
              h3: ({ children }) => (
                <h3 className="text-sm font-semibold mt-3 mb-2 text-foreground">
                  {children}
                </h3>
              ),
              h4: ({ children }) => (
                <h4 className="text-xs font-semibold mt-2 mb-1 text-muted-foreground">
                  {children}
                </h4>
              ),
              // Links
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {children}
                </a>
              ),
              // Paragraphs
              p: ({ children }) => (
                <p className="my-1.5 text-sm leading-relaxed">{children}</p>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

export function SessionContextCard({ sessionId }: SessionContextCardProps) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMarkdown() {
      try {
        const data = await getSessionMarkdown(sessionId);
        if (data.exists && data.content) {
          setMarkdown(data.content);
        }
      } catch (err) {
        setError("Failed to load context");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchMarkdown();
  }, [sessionId]);

  if (loading) {
    return null; // Don't show loading state for optional content
  }

  if (error || !markdown) {
    return null; // Don't show error for optional content
  }

  const sections = parseMarkdownSections(markdown);

  // Extract header info
  const headerContent = sections.header || "";
  const headerLines = headerContent.split("\n").filter((l) => l.trim());

  // Get metadata from header
  const metadata: Record<string, string> = {};
  for (const line of headerLines.slice(1)) {
    const match = line.match(/^\*\*(.+?):\*\*\s*(.+)$/);
    if (match) {
      metadata[match[1]] = match[2];
    }
  }

  // Sections to display (in order)
  const orderedSections = [
    "計画・タスク",
    "議論の経緯",
    "コード例",
    "参照情報",
    "次回への引き継ぎ",
    "エラー・解決策",
  ];

  const availableSections = orderedSections.filter(
    (s) =>
      sections[s] && sections[s].trim() !== "" && sections[s].trim() !== "---",
  );

  if (availableSections.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <span className="text-xl">📝</span>
          Session Context
          <Badge variant="secondary" className="text-xs font-normal">
            {availableSections.length} sections
          </Badge>
        </CardTitle>
        {Object.keys(metadata).length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
            {metadata.Status && (
              <Badge
                variant={metadata.Status === "complete" ? "default" : "outline"}
                className="text-xs"
              >
                {metadata.Status}
              </Badge>
            )}
            {metadata.Date && <span>📅 {metadata.Date}</span>}
            {metadata.Branch && (
              <span className="font-mono">🌿 {metadata.Branch}</span>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {orderedSections.map((sectionName) =>
          sections[sectionName] ? (
            <SectionCard
              key={sectionName}
              title={sectionName}
              content={sections[sectionName]}
            />
          ) : null,
        )}
      </CardContent>
    </Card>
  );
}
