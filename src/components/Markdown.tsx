import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Post bodies are written by crew members and drafted by Claude from guests'
 * accounts, so raw HTML is never rendered (react-markdown escapes it) and
 * unsafe link protocols are dropped. Claude drafts only ever contain links to
 * the night's venue websites (see sanitizeDraftBody).
 */
export function Markdown({
  children,
}: {
  children: string;
}) {
  return (
    <div className="prose-night">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={["img"]}
        unwrapDisallowed
        components={{
          a: ({ href, children }) => {
            if (!href) return <>{children}</>;
            return (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
                {children}
              </a>
            );
          },
          h1: ({ children }) => <h2>{children}</h2>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
