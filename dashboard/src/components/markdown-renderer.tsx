import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** Style variant: "default" for light bg (assistant), "dark" for dark bg (user messages) */
  variant?: "default" | "dark";
}

export function MarkdownRenderer({
  content,
  className = "",
  variant = "default",
}: MarkdownRendererProps) {
  const isDark = variant === "dark";

  return (
    <div
      className={`prose prose-sm prose-stone dark:prose-invert max-w-none ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Code blocks - reset nested code styles with [&>code]
          pre: ({ children }) => (
            <pre
              className={
                isDark
                  ? "bg-[#1a1816]/60 text-stone-100 rounded-lg p-3 overflow-x-auto my-2 text-xs border border-white/20 [&>code]:bg-transparent [&>code]:p-0 [&>code]:border-0 [&>code]:text-inherit"
                  : "bg-stone-700 dark:bg-stone-800 text-stone-100 rounded-lg p-3 overflow-x-auto my-2 text-xs [&>code]:bg-transparent [&>code]:p-0 [&>code]:border-0 [&>code]:text-inherit"
              }
            >
              {children}
            </pre>
          ),
          // Inline code
          code: ({ children, className: codeClassName }) => {
            // If it's inside a pre (code block), render simply
            const isInline = !codeClassName;
            if (isInline) {
              return (
                <code
                  className={
                    isDark
                      ? "bg-white/15 text-white px-1.5 py-0.5 rounded text-xs font-mono"
                      : "bg-stone-200 dark:bg-stone-700 text-stone-700 dark:text-stone-200 px-1.5 py-0.5 rounded text-xs font-mono"
                  }
                >
                  {children}
                </code>
              );
            }
            // Code block content
            return <code className="text-xs font-mono">{children}</code>;
          },
          // Paragraphs
          p: ({ children }) => (
            <p className="my-1.5 leading-relaxed">{children}</p>
          ),
          // Lists
          ul: ({ children }) => (
            <ul className="list-disc list-inside my-1.5 space-y-0.5">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside my-1.5 space-y-0.5">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="ml-2">{children}</li>,
          // Headers
          h1: ({ children }) => (
            <h1 className="text-lg font-bold mt-3 mb-1.5">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold mt-2.5 mb-1">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>
          ),
          // Links - Claude terracotta orange
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={
                isDark
                  ? "text-orange-200 hover:underline"
                  : "text-[#C15F3C] dark:text-orange-400 hover:underline"
              }
            >
              {children}
            </a>
          ),
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote
              className={
                isDark
                  ? "border-l-2 border-white/30 pl-3 my-2 text-stone-200 italic"
                  : "border-l-2 border-stone-300 dark:border-stone-600 pl-3 my-2 text-stone-600 dark:text-stone-400 italic"
              }
            >
              {children}
            </blockquote>
          ),
          // Tables (GFM)
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="min-w-full border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th
              className={
                isDark
                  ? "border border-white/20 px-2 py-1 bg-white/10 font-medium text-left"
                  : "border border-stone-300 dark:border-stone-600 px-2 py-1 bg-stone-100 dark:bg-stone-800 font-medium text-left"
              }
            >
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td
              className={
                isDark
                  ? "border border-white/20 px-2 py-1"
                  : "border border-stone-300 dark:border-stone-600 px-2 py-1"
              }
            >
              {children}
            </td>
          ),
          // Horizontal rule
          hr: () => (
            <hr
              className={
                isDark
                  ? "my-3 border-white/20"
                  : "my-3 border-stone-200 dark:border-stone-700"
              }
            />
          ),
          // Strong/Bold
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          // Emphasis/Italic
          em: ({ children }) => <em className="italic">{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
