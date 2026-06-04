/** A subsection: a collapsible group of fields rendered within a page. */
export interface AioSubsectionItem {
  kind: 'subsection';
  /** The subsection entry id (sub-option values are namespaced under it) */
  id: string;
  /** Display title, from the subsection's name */
  title: string;
  description?: string;
  /** Collapsed by default in the UI when true */
  advanced?: boolean;
  /** Visual style hint from the template ("block" | "inline") */
  subsectionIntent?: string;
  /** The subsection entry itself (carries description, __if, etc.) */
  headerField: unknown;
  /** Alert/header.* sub-options shown inside the subsection */
  alertFields: unknown[];
  /** Non-alert, non-socials sub-option ids belonging to this subsection */
  fieldIds: string[];
}

/** An ordered entry within a section: either a plain field or a subsection group. */
export type AioItem =
  | { kind: 'field'; id: string }
  | AioSubsectionItem;

export interface AioSection {
  /** The header.X id, e.g. "header.formatter" */
  id: string;
  /** Display title, from header.name or derived from header.id */
  title: string;
  /** The titled header field itself */
  headerField: unknown;
  /** Untitled alert fields that should be shown within the section */
  alertFields: unknown[];
  /** Ordered fields and subsections belonging to this section */
  items: AioItem[];
  /** Section icon (extracted from header.name emoji if present) */
  icon: string;
}

/**
 * Groups metadata.inputs by header.* fields into sections.
 * Pure function, called once when template loads.
 * Each header.X starts a new section; all non-header fields
 * until the next header belong to that section.
 * Fields of type 'socials' are skipped.
 */
export function buildAioSections(template: unknown): AioSection[] {
  const t = template as { metadata?: { inputs?: unknown[] } };
  const inputs = t?.metadata?.inputs ?? [];
  const sections: AioSection[] = [];

  let current: AioSection | null = null;

  for (const field of inputs) {
    const f = field as { id?: string; type?: string; name?: string; description?: string;
      advanced?: boolean; subsectionIntent?: string; subOptions?: unknown[] };
    if (f.type === 'socials') continue; // skip credits

    if (f.id?.startsWith('header.')) {
      const rawName = (f.name ?? '').trim();

      if (!rawName) {
        if (current) current.alertFields.push(field);
        continue;
      }

      // Flush previous section
      if (current) sections.push(current);
      // Start new section
      const icon = extractLeadingEmoji(rawName);
      const title = rawName.replace(/^[\p{Emoji}\s]+/u, '').trim() || prettifyHeaderId(f.id);
      current = {
        id: f.id,
        title: title || prettifyHeaderId(f.id),
        headerField: field,
        alertFields: [],
        items: [],
        icon,
      };
    } else if (f.type === 'alert') {
      if (current) current.alertFields.push(field);
    } else {
      // Regular input or subsection: add to current section (or a catch-all if no header yet)
      if (!current) {
        current = {
          id: 'header.__root',
          title: 'Settings',
          headerField: null,
          alertFields: [],
          items: [],
          icon: '⚙️',
        };
      }
      if (f.type === 'subsection' && f.id) {
        const { alertFields, fieldIds } = walkSubOptions(f.subOptions ?? []);
        current.items.push({
          kind: 'subsection',
          id: f.id,
          title: (f.name ?? '').trim() || prettifyHeaderId(f.id),
          description: f.description,
          advanced: f.advanced,
          subsectionIntent: f.subsectionIntent,
          headerField: field,
          alertFields,
          fieldIds,
        });
      } else if (f.id) {
        current.items.push({ kind: 'field', id: f.id });
      }
    }
  }

  if (current) sections.push(current);
  return sections;
}

/**
 * Split a subsection's subOptions into alert-like entries (header.* / alert types,
 * rendered as banners inside the group) and regular field ids. Socials are skipped.
 */
function walkSubOptions(subOptions: unknown[]): { alertFields: unknown[]; fieldIds: string[] } {
  const alertFields: unknown[] = [];
  const fieldIds: string[] = [];
  for (const opt of subOptions) {
    const o = opt as { id?: string; type?: string };
    if (o?.type === 'socials') continue;
    if (o?.id?.startsWith('header.') || o?.type === 'alert') alertFields.push(opt);
    else if (o?.id) fieldIds.push(o.id);
  }
  return { alertFields, fieldIds };
}

function prettifyHeaderId(id: string): string {
  return id.replace('header.', '').replace(/([A-Z])/g, ' $1').replace(/^\w/, c => c.toUpperCase()).trim();
}

function extractLeadingEmoji(text: string): string {
  const match = text.match(/^([\p{Emoji}]+)/u);
  return match ? match[1] : '';
}
