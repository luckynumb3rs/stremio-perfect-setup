import type { CSSProperties } from 'react';

interface Props {
  text: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Minimal safe markdown renderer. Escapes HTML, then applies:
 * **bold**, *italic*, `code`, [text](url), \n* bullet items, \n line breaks.
 * Safe for use with dangerouslySetInnerHTML because HTML is escaped first.
 */
export function MarkdownText({ text, className, style }: Props) {
  const html = renderMarkdown(text);
  return (
    <div
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderMarkdown(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let html = esc(text)
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic (avoid matching **)
    .replace(/\*(?!\*)([^*]+)\*(?!\*)/g, '<em>$1</em>')
    // Code
    .replace(/`([^`]+)`/g, '<code style="font-family:\'IBM Plex Mono\',monospace;font-size:0.875em;background:var(--panel-2);padding:0.1em 0.3em;border-radius:4px">$1</code>')
    // Links
    .replace(
      /\[([^\]]+)\]\((https?:[^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:underline">$1</a>'
    )
    // Bullet list items: convert \n* to list items
    .replace(/\n\* /g, '\n<li style="margin-left:1rem;list-style:disc">')
    // Line breaks
    .replace(/\n/g, '<br>');

  return html;
}
