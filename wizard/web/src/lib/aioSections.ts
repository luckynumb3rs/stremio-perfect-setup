export interface AioSection {
  /** The header.X id, e.g. "header.formatter" */
  id: string;
  /** Display title, from header.name or derived from header.id */
  title: string;
  /** The titled header field itself */
  headerField: unknown;
  /** Untitled alert fields that should be shown within the section */
  alertFields: unknown[];
  /** Non-header, non-socials field ids belonging to this section */
  fieldIds: string[];
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
    const f = field as { id?: string; type?: string; name?: string; description?: string };
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
        fieldIds: [],
        icon,
      };
    } else if (f.type === 'alert') {
      if (current) current.alertFields.push(field);
    } else {
      // Regular input: add to current section (or a catch-all if no header yet)
      if (!current) {
        current = {
          id: 'header.__root',
          title: 'Settings',
          headerField: null,
          alertFields: [],
          fieldIds: [],
          icon: '⚙️',
        };
      }
      if (f.id) current.fieldIds.push(f.id);
    }
  }

  if (current) sections.push(current);
  return sections;
}

function prettifyHeaderId(id: string): string {
  return id.replace('header.', '').replace(/([A-Z])/g, ' $1').replace(/^\w/, c => c.toUpperCase()).trim();
}

function extractLeadingEmoji(text: string): string {
  const match = text.match(/^([\p{Emoji}]+)/u);
  return match ? match[1] : '';
}
