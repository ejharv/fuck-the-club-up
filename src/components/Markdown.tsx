import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Post bodies are written by crew members, so raw HTML is never rendered
 * (react-markdown escapes it by default) and unsafe link protocols are dropped.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-night">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={["img"]}
        unwrapDisallowed
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
              {children}
            </a>
          ),
          h1: ({ children }) => <h2>{children}</h2>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
