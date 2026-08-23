"use client";

import "@assistant-ui/react-markdown/styles/dot.css";

import {
  type CodeHeaderProps,
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
  useIsMarkdownCodeBlock,
} from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { type FC, memo, useState, ReactNode, Children, isValidElement, cloneElement } from "react";
import { CheckIcon, CopyIcon, FileTextIcon } from "lucide-react";

import { TooltipIconButton } from "@/components/tooltip-icon-button";
import { useDocViewer } from "@/components/doc-viewer-modal";
import { cn } from "@/lib/utils";

const MarkdownTextImpl = () => {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="aui-md prose-chat"
      components={defaultComponents}
      defer
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const onCopy = () => {
    if (!code || isCopied) return;
    copyToClipboard(code);
  };

  return (
    <div className="aui-code-header-root border-border/50 bg-muted/50 mt-3 flex items-center justify-between rounded-t-xl border border-b-0 px-3.5 py-1.5 text-xs">
      <span className="aui-code-header-language text-muted-foreground font-medium lowercase">
        {language}
      </span>
      <TooltipIconButton tooltip="Copy" onClick={onCopy}>
        {!isCopied && (
          <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
        )}
        {isCopied && (
          <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
        )}
      </TooltipIconButton>
    </div>
  );
};

const useCopyToClipboard = ({
  copiedDuration = 3000,
}: {
  copiedDuration?: number;
} = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const copyToClipboard = (value: string) => {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }

    navigator.clipboard.writeText(value).then(
      () => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), copiedDuration);
      },
      () => {},
    );
  };

  return { isCopied, copyToClipboard };
};

// ─── Clickable Citation Badge Component ────────────────────────────────────────

function CitationBadge({ docId, section, text }: { docId: string; section?: string; text: string }) {
  const { openDoc } = useDocViewer();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openDoc(docId, section);
      }}
      title={`Click to inspect official text clause from ${docId}${section ? ` § ${section}` : ""}`}
      className="inline-flex items-center gap-1 mx-0.5 px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-primary/10 text-primary border border-primary/25 hover:bg-primary hover:text-primary-foreground transition-all cursor-pointer shadow-2xs select-none"
    >
      <FileTextIcon className="h-3 w-3 shrink-0" />
      <span>{text}</span>
    </button>
  );
}

// Helper to replace citation syntax [DOC-xxx §section] or DOC-xxx with CitationBadge elements
function parseCitationsInNode(node: ReactNode): ReactNode {
  if (typeof node === "string") {
    // Matches patterns like [DOC-004 §1], [DOC-001 §Plan capabilities], [DOC-005], or (DOC-002)
    const citationRegex = /\[(DOC-\d{3})(?:\s*[§#:]\s*([^\]]+))?\]/g;
    const parts: ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = citationRegex.exec(node)) !== null) {
      const matchIndex = match.index;
      const fullMatch = match[0];
      const docId = match[1];
      const section = match[2];

      if (matchIndex > lastIndex) {
        parts.push(node.substring(lastIndex, matchIndex));
      }

      parts.push(
        <CitationBadge
          key={`${docId}-${section || "all"}-${matchIndex}`}
          docId={docId}
          section={section}
          text={fullMatch}
        />
      );

      lastIndex = matchIndex + fullMatch.length;
    }

    if (lastIndex === 0) {
      return node;
    }

    if (lastIndex < node.length) {
      parts.push(node.substring(lastIndex));
    }

    return parts;
  }

  if (Array.isArray(node)) {
    return Children.map(node, (child) => parseCitationsInNode(child));
  }

  if (isValidElement(node)) {
    if (node.props && (node.props as { children?: ReactNode }).children) {
      const childProps = node.props as { children?: ReactNode };
      return cloneElement(node, {
        ...node.props,
        children: parseCitationsInNode(childProps.children),
      } as React.Attributes);
    }
  }

  return node;
}

const defaultComponents = memoizeMarkdownComponents({
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        "aui-md-h1 mt-5 mb-2 scroll-m-20 text-xl font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        "aui-md-h2 mt-5 mb-2 scroll-m-20 text-lg font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn(
        "aui-md-h3 mt-4 mb-1.5 scroll-m-20 text-base font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn(
        "aui-md-h4 mt-3.5 mb-1 scroll-m-20 text-base font-medium first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }) => (
    <h5
      className={cn(
        "aui-md-h5 mt-3 mb-1 text-sm font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      className={cn(
        "aui-md-h6 mt-3 mb-1 text-sm font-medium first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, children, ...props }) => (
    <p
      className={cn(
        "aui-md-p my-3 leading-relaxed first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    >
      {parseCitationsInNode(children)}
    </p>
  ),
  a: ({ className, children, href, ...props }) => {
    // If link targets a doc ID (e.g. href="#DOC-004" or href="DOC-004")
    if (href && (href.startsWith("#doc-") || href.startsWith("doc:") || /^#?DOC-\d{3}/i.test(href))) {
      const match = href.match(/DOC-\d{3}/i);
      if (match) {
        return (
          <CitationBadge
            docId={match[0].toUpperCase()}
            text={typeof children === "string" ? children : match[0]}
          />
        );
      }
    }
    return (
      <a
        className={cn(
          "aui-md-a text-primary hover:text-primary/80 underline underline-offset-2",
          className,
        )}
        href={href}
        {...props}
      >
        {parseCitationsInNode(children)}
      </a>
    );
  },
  blockquote: ({ className, children, ...props }) => (
    <blockquote
      className={cn(
        "aui-md-blockquote border-muted-foreground/30 text-muted-foreground my-3 border-s-2 ps-4",
        className,
      )}
      {...props}
    >
      {parseCitationsInNode(children)}
    </blockquote>
  ),
  ul: ({ className, children, ...props }) => (
    <ul
      className={cn(
        "aui-md-ul marker:text-muted-foreground my-3 ms-5 list-disc [&>li]:mt-1",
        className,
      )}
      {...props}
    >
      {parseCitationsInNode(children)}
    </ul>
  ),
  ol: ({ className, children, ...props }) => (
    <ol
      className={cn(
        "aui-md-ol marker:text-muted-foreground my-3 ms-5 list-decimal [&>li]:mt-1",
        className,
      )}
      {...props}
    >
      {parseCitationsInNode(children)}
    </ol>
  ),
  hr: ({ className, ...props }) => (
    <hr
      className={cn("aui-md-hr border-muted-foreground/20 my-3", className)}
      {...props}
    />
  ),
  table: ({ className, children, ...props }) => (
    <table
      className={cn(
        "aui-md-table my-3 w-full border-separate border-spacing-0 overflow-y-auto",
        className,
      )}
      {...props}
    >
      {parseCitationsInNode(children)}
    </table>
  ),
  th: ({ className, children, ...props }) => (
    <th
      className={cn(
        "aui-md-th bg-muted px-3 py-1.5 text-start font-medium first:rounded-ss-lg last:rounded-se-lg [[align=center]]:text-center [[align=right]]:text-right",
        className,
      )}
      {...props}
    >
      {parseCitationsInNode(children)}
    </th>
  ),
  td: ({ className, children, ...props }) => (
    <td
      className={cn(
        "aui-md-td border-muted-foreground/20 border-s border-b px-3 py-1.5 text-start last:border-e [[align=center]]:text-center [[align=right]]:text-right",
        className,
      )}
      {...props}
    >
      {parseCitationsInNode(children)}
    </td>
  ),
  tr: ({ className, ...props }) => (
    <tr
      className={cn(
        "aui-md-tr m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-es-lg [&:last-child>td:last-child]:rounded-ee-lg",
        className,
      )}
      {...props}
    />
  ),
  li: ({ className, children, ...props }) => (
    <li className={cn("aui-md-li leading-relaxed", className)} {...props}>
      {parseCitationsInNode(children)}
    </li>
  ),
  strong: ({ className, children, ...props }) => (
    <strong
      className={cn("aui-md-strong font-semibold", className)}
      {...props}
    >
      {parseCitationsInNode(children)}
    </strong>
  ),
  sup: ({ className, ...props }) => (
    <sup
      className={cn("aui-md-sup [&>a]:text-xs [&>a]:no-underline", className)}
      {...props}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        "aui-md-pre border-border/50 bg-muted/30 overflow-x-auto rounded-t-none rounded-b-xl border border-t-0 p-3.5 text-[13px] leading-relaxed",
        className,
      )}
      {...props}
    />
  ),
  code: function Code({ className, ...props }) {
    const isCodeBlock = useIsMarkdownCodeBlock();
    return (
      <code
        className={cn(
          !isCodeBlock &&
            "aui-md-inline-code bg-muted rounded-md px-1.5 py-0.5 font-mono text-[0.85em]",
          className,
        )}
        {...props}
      />
    );
  },
  CodeHeader,
});
