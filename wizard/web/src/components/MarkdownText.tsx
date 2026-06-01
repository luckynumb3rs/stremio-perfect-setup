import type { CSSProperties } from 'react';
import { resolveSiteUrl } from '../lib/site';

interface Props {
  text: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Minimal safe markdown renderer. Escapes HTML, then applies:
 * paragraphs, unordered lists, **bold**, *italic*, `code`, [text](url), and line breaks.
 * Safe for use with dangerouslySetInnerHTML because HTML is escaped first.
 */
export function MarkdownText({ text, className, style }: Props) {
  const html = renderMarkdown(text);
  return (
    <div
      className={['wizard-rich-text', className].filter(Boolean).join(' ')}
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderMarkdown(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escAttr = (s: string) => esc(s).replace(/"/g, '&quot;');

  const renderInline = (value: string) => {
    const linkTokens: string[] = [];
    const withLinkTokens = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
      const token = `@@WIZARD_LINK_${linkTokens.length}@@`;
      const resolvedHref = resolveSiteUrl(href);
      linkTokens.push(
        `<a href="${escAttr(resolvedHref)}" target="_blank" rel="noopener noreferrer" class="guide-pill-link">${esc(label)}</a>`
      );
      return token;
    });

    return esc(withLinkTokens)
      // Code
      .replace(/`([^`]+)`/g, '<code style="font-family:\'IBM Plex Mono\',monospace;font-size:0.875em;background:var(--panel-2);padding:0.1em 0.3em;border-radius:4px">$1</code>')
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // Italic (avoid matching **)
      .replace(/\*(?!\*)([^*]+)\*(?!\*)/g, '<em>$1</em>')
      // Links
      .replace(/@@WIZARD_LINK_(\d+)@@/g, (_match, index: string) => linkTokens[Number(index)] ?? '');
  };

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    blocks.push(`<p style="margin:0 0 0.55rem 0">${paragraphLines.map(renderInline).join('<br>')}</p>`);
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(
      `<ul style="margin:0.45rem 0 0.55rem;padding-left:1.15rem;list-style-type:disc;list-style-position:outside">${listItems.map(item => `<li style="margin:0 0 0.25rem 0;display:list-item;list-style-type:disc">${renderInline(item)}</li>`).join('')}</ul>`
    );
    listItems = [];
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      listItems.push(trimmed.replace(/^[-*]\s+/, ''));
      continue;
    }

    flushList();
    paragraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();

  return blocks.join('');
}
