"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, useEditorState, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { createContext, useContext, useEffect, useRef, useState } from "react";

/**
 * A visual editor for a story: bold, italic, headings, quotes, lists, links
 * (paste a link over selected words) and photos placed between paragraphs.
 * Nobody sees Markdown. It still reads and writes Markdown underneath, kept in
 * a hidden <textarea name={name}> so forms, autosave and writing help work as
 * before. Photos are stored as [[photo:…]], [[media:…]] or [[new:…]] lines.
 */
export type StoryPhoto = { marker: string; src: string | null; kind: string; caption?: string | null; note?: string | null };

const PhotoLookup = createContext<Map<string, StoryPhoto>>(new Map());

function PhotoView({ node, deleteNode, selected }: NodeViewProps) {
  const lookup = useContext(PhotoLookup);
  const marker = String(node.attrs.marker ?? "");
  const p = lookup.get(marker);
  return (
    <NodeViewWrapper className={`my-4 rounded-md border-2 p-2 ${selected ? "border-maize" : "border-line"}`} data-drag-handle>
      <div className="flex items-start gap-3">
        {p?.src && p.kind === "video" ? (
          <video src={p.src} muted playsInline preload="metadata" className="h-24 w-24 shrink-0 rounded bg-black object-cover" />
        ) : p?.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.src} alt="" className="h-24 w-24 shrink-0 rounded object-cover" />
        ) : (
          <span className="grid h-24 w-24 shrink-0 place-items-center rounded bg-night-2 text-xs text-dim">Photo</span>
        )}
        <div className="min-w-0 flex-1 text-sm">
          <p className="mono text-maize">{p?.kind === "video" ? "Video" : "Photo"} in the story</p>
          {p?.caption && <p className="mt-1 line-clamp-2">{p.caption}</p>}
          {p?.note && <p className="mt-1 text-pink">{p.note}</p>}
          {!p && <p className="mt-1 text-dim">This photo isn&apos;t in this post anymore. It won&apos;t show up.</p>}
          <p className="mt-1 text-xs text-dim">Drag to move it.</p>
        </div>
        <button type="button" onClick={() => deleteNode()} className="-m-1 inline-flex min-h-11 shrink-0 items-center px-2 text-sm text-dim underline hover:text-pink">
          Remove
        </button>
      </div>
    </NodeViewWrapper>
  );
}

const MARKER = /^\[\[((?:photo|media|new):[0-9a-f-]{8,36})\]\][ \t]*(?:\n+|$)/;

const StoryPhotoNode = Node.create({
  name: "storyPhoto",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { marker: { default: "" } };
  },
  parseHTML() {
    return [{ tag: "div[data-story-photo]", getAttrs: (el) => ({ marker: (el as HTMLElement).getAttribute("data-story-photo") }) }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-story-photo": HTMLAttributes.marker })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PhotoView);
  },
  markdownTokenName: "storyPhoto",
  markdownTokenizer: {
    name: "storyPhoto",
    level: "block",
    start: (src: string) => src.indexOf("[["),
    tokenize: (src: string) => {
      const m = MARKER.exec(src);
      if (!m) return undefined;
      return { type: "storyPhoto", raw: m[0], marker: m[1].toLowerCase() } as never;
    },
  },
  parseMarkdown: (token) => ({ type: "storyPhoto", attrs: { marker: String((token as { marker?: string }).marker ?? "") } }),
  renderMarkdown: (node: { attrs?: { marker?: string } }) => `[[${node.attrs?.marker ?? ""}]]`,
});

function Btn({ on, label, onClick, children }: { on?: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded px-2 font-bold ${on ? "bg-maize text-night" : "hover:bg-night-2"}`}
    >
      {children}
    </button>
  );
}

export function RichStory({
  name,
  id,
  defaultValue,
  photos = [],
  placeholder,
  minHeight = "16rem",
  value,
  onChange,
  onBlur,
}: {
  name: string;
  id?: string;
  defaultValue: string;
  photos?: StoryPhoto[];
  placeholder?: string;
  minHeight?: string;
  /** Controlled mode: the parent owns the Markdown. */
  value?: string;
  onChange?: (markdown: string) => void;
  onBlur?: () => void;
}) {
  const hidden = useRef<HTMLTextAreaElement>(null);
  const internal = useRef(false);
  const [picking, setPicking] = useState(false);
  const lookup = new Map(photos.map((p) => [p.marker, p]));
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  useEffect(() => {
    onChangeRef.current = onChange;
    onBlurRef.current = onBlur;
  });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer nofollow" } },
      }),
      Markdown,
      Placeholder.configure({ placeholder: placeholder ?? "" }),
      StoryPhotoNode,
    ],
    content: defaultValue,
    contentType: "markdown",
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        class: "prose-night field max-w-none leading-relaxed focus:outline-none",
        style: `min-height:${minHeight}`,
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onBlur: () => onBlurRef.current?.(),
    onUpdate: ({ editor }) => {
      onChangeRef.current?.(editor.getMarkdown());
      const el = hidden.current;
      if (!el) return;
      el.value = editor.getMarkdown();
      internal.current = true;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      internal.current = false;
    },
  });

  // Controlled mode: the parent replaced the text (restore, writing help).
  useEffect(() => {
    if (!editor || value === undefined) return;
    if (value !== editor.getMarkdown()) editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  // Someone set the text from outside (writing help, restoring autosave): load it.
  useEffect(() => {
    const el = hidden.current;
    if (!el || !editor) return;
    const onInput = () => {
      if (internal.current) return;
      editor.commands.setContent(el.value, { contentType: "markdown", emitUpdate: false });
    };
    el.addEventListener("input", onInput);
    return () => el.removeEventListener("input", onInput);
  }, [editor]);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            h2: e.isActive("heading", { level: 2 }),
            quote: e.isActive("blockquote"),
            list: e.isActive("bulletList"),
            link: e.isActive("link"),
            placed: (() => {
              const s = new Set<string>();
              e.state.doc.descendants((n) => {
                if (n.type.name === "storyPhoto") s.add(String(n.attrs.marker));
              });
              return [...s].join(",");
            })(),
          }
        : null,
  });
  const placed = new Set((state?.placed ?? "").split(",").filter(Boolean));

  function link() {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const raw = window.prompt("Paste the link:");
    if (!raw) return;
    const url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`;
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" && u.protocol !== "http:") return;
    } catch {
      return;
    }
    const { empty } = editor.state.selection;
    if (empty) editor.chain().focus().insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] }).run();
    else editor.chain().focus().setLink({ href: url }).run();
  }

  function place(marker: string) {
    editor?.chain().focus().insertContent({ type: "storyPhoto", attrs: { marker } }).run();
    setPicking(false);
  }

  return (
    <PhotoLookup.Provider value={lookup}>
      <div className="rounded-md border border-line bg-night-2/40">
        <div role="toolbar" aria-label="Formatting" className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-md border-b border-line bg-night/95 p-1 backdrop-blur">
          <Btn label="Bold" on={state?.bold} onClick={() => editor?.chain().focus().toggleBold().run()}>B</Btn>
          <Btn label="Italic" on={state?.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}><span className="italic">I</span></Btn>
          <Btn label="Heading" on={state?.h2} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H</Btn>
          <Btn label="Quote" on={state?.quote} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>“</Btn>
          <Btn label="List" on={state?.list} onClick={() => editor?.chain().focus().toggleBulletList().run()}>•</Btn>
          <Btn label={state?.link ? "Remove link" : "Add a link"} on={state?.link} onClick={link}><span className="text-sm">Link</span></Btn>
          {photos.length > 0 && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPicking((v) => !v)}
              aria-expanded={picking}
              className="ml-auto inline-flex min-h-11 items-center rounded-full border border-maize px-4 text-sm font-bold text-maize hover:bg-maize hover:text-night"
            >
              + Add photo here
            </button>
          )}
        </div>
        {picking && (
          <div className="border-b border-line p-3">
            <p className="text-sm text-dim">Tap one to put it where your cursor is.</p>
            <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {photos.map((p) => (
                <li key={p.marker}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => place(p.marker)}
                    disabled={placed.has(p.marker)}
                    className="relative block w-full overflow-hidden rounded border border-line hover:border-maize disabled:opacity-40"
                    aria-label={`${p.kind === "video" ? "Video" : "Photo"}${p.caption ? `: ${p.caption}` : ""}${placed.has(p.marker) ? " (already in the story)" : ""}`}
                  >
                    {p.src && p.kind === "video" ? (
                      <video src={p.src} muted playsInline preload="metadata" className="aspect-square w-full bg-black object-cover" />
                    ) : p.src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.src} alt="" className="aspect-square w-full object-cover" />
                    ) : (
                      <span className="grid aspect-square place-items-center text-xs text-dim">{p.kind}</span>
                    )}
                    {placed.has(p.marker) && <span className="mono absolute inset-x-0 bottom-0 bg-night/80 py-0.5 text-center text-[10px] text-maize">In the story</span>}
                    {!placed.has(p.marker) && p.note && <span className="mono absolute inset-x-0 bottom-0 bg-night/80 py-0.5 text-center text-[10px] text-pink">{p.note}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="p-1">
          <EditorContent editor={editor} />
        </div>
      </div>
      <textarea ref={hidden} name={name} defaultValue={defaultValue} hidden readOnly aria-hidden tabIndex={-1} />
    </PhotoLookup.Provider>
  );
}
