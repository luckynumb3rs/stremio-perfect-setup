import type { CSSProperties } from 'react';
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { MarkdownText } from '../components/MarkdownText';
import { useWizard } from '../store/wizard';

// @ts-ignore
import { isVisible } from '@core/template-engine.js';

interface TemplateField {
  id: string;
  name?: string;
  description?: string;
  type?: string;
  required?: boolean;
  default?: unknown;
  options?: { value: string; label: string }[];
  intent?: string;
}

function AlertBanner({ field }: { field: TemplateField }) {
  const colorMap: Record<string, { bg: string; border: string; color: string }> = {
    warning:      { bg: '#fffbeb', border: '#fde68a', color: '#92400e' },
    info:         { bg: 'var(--panel-2)', border: 'var(--accent)', color: 'var(--accent)' },
    'info-basic': { bg: 'var(--panel-2)', border: 'var(--border)', color: 'var(--muted)' },
  };
  const c = colorMap[field.intent ?? 'info-basic'] ?? colorMap['info-basic'];
  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`, borderRadius: '10px',
      padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem', color: c.color,
    }}>
      {field.name && <strong style={{ display: 'block', marginBottom: '0.25rem' }}>{field.name}</strong>}
      {field.description && <MarkdownText text={field.description} />}
    </div>
  );
}

interface Props { sectionIndex: number; }

export function AioSectionStep({ sectionIndex }: Props) {
  const { templates, aioSections, aioStreamsInputs, credentials, setAioStreamsInput, nextStep } = useWizard();
  const section = aioSections[sectionIndex];
  const template = templates?.aiostreams;

  if (!template || !section) {
    return (
      <WizardShell>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem', textAlign: 'center' }}>Loading...</p>
      </WizardShell>
    );
  }

  const t = template as { metadata?: { inputs?: TemplateField[] } };
  const allInputs = t?.metadata?.inputs ?? [];
  const inputsById = Object.fromEntries(allInputs.map((f: TemplateField) => [f.id, f]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx: any = {
    inputs: aioStreamsInputs,
    services: credentials.debridServices.map((d: { id: string }) => d.id),
  };

  const headerField = section.headerField as TemplateField | null;
  const alertFields = section.alertFields as TemplateField[];

  // Get visible fields for this section
  const sectionFields: TemplateField[] = section.fieldIds
    .map((id: string) => inputsById[id])
    .filter(Boolean)
    .filter((f: TemplateField) => isVisible(f, ctx));

  const sectionAlerts: TemplateField[] = alertFields.filter((f: TemplateField) => isVisible(f, ctx));

  // Block continue if any required visible field is empty
  const isBlocked = sectionFields.some((f: TemplateField) => {
    if (!f.required) return false;
    const val = aioStreamsInputs[f.id] ?? f.default;
    if (Array.isArray(val)) return val.length === 0;
    return val === undefined || val === null || val === '';
  });

  return (
    <WizardShell>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)', marginBottom: '1rem' }}>
        {section.icon} {section.title}
      </h2>

      {headerField?.description && <AlertBanner field={headerField} />}
      {sectionAlerts.map((field) => <AlertBanner key={field.id} field={field} />)}

      {sectionFields.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          No options to configure for your current setup.
        </p>
      )}

      {sectionFields.map((field: TemplateField) => (
        <FieldRenderer
          key={field.id}
          field={field}
          value={aioStreamsInputs[field.id] ?? field.default}
          onChange={(val: unknown) => setAioStreamsInput(field.id, val)}
        />
      ))}

      <NextButton onClick={nextStep} disabled={isBlocked} />
    </WizardShell>
  );
}

interface FieldProps {
  field: TemplateField;
  value: unknown;
  onChange: (v: unknown) => void;
}

function FieldRenderer({ field, value, onChange }: FieldProps) {
  const isEnabled = Boolean(value);
  const inputStyle: CSSProperties = {
    width: '100%', border: '1px solid var(--border)', borderRadius: '8px',
    padding: '0.5rem 0.75rem', fontSize: '0.875rem',
    background: 'var(--panel)', color: 'var(--text)', outline: 'none',
    boxSizing: 'border-box',
  };

  const selectedBtn = (sel: boolean): CSSProperties => ({
    padding: '0.55rem 0.75rem', borderRadius: '10px',
    border: `2px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
    background: sel ? 'var(--panel-2)' : 'var(--panel)',
    cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
    transition: 'all 0.15s', width: '100%', display: 'block',
  });

  if (field.type === 'boolean') {
    return (
      <div style={{ marginBottom: '1.25rem' }}>
        <button
          type="button"
          onClick={() => onChange(!value)}
          aria-pressed={isEnabled}
          style={{
            width: '100%',
            borderRadius: '14px',
            border: `2px solid ${isEnabled ? 'var(--accent)' : 'var(--border)'}`,
            background: isEnabled ? 'var(--panel-2)' : 'var(--panel)',
            color: 'var(--text)',
            cursor: 'pointer',
            textAlign: 'left',
            padding: '0.95rem 1rem',
            transition: 'all 0.15s',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div style={{ minWidth: 0, flex: '1 1 auto' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
              {field.name || field.id}
              {field.required && <span style={{ color: '#e53e3e', marginLeft: '0.25rem' }}>*</span>}
            </div>
            {field.description && (
              <MarkdownText
                text={field.description}
                style={{ color: 'var(--muted)', fontSize: '0.8125rem', marginTop: '0.3rem', lineHeight: 1.55 }}
              />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.45rem', flex: '0 0 auto' }}>
            <div
              aria-hidden="true"
              style={{
                width: '3rem',
                height: '1.7rem',
                borderRadius: '999px',
                background: isEnabled ? 'var(--accent)' : 'color-mix(in srgb, var(--border) 70%, var(--panel) 30%)',
                border: `1px solid ${isEnabled ? 'var(--accent)' : 'var(--border)'}`,
                padding: '0.12rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: isEnabled ? 'flex-end' : 'flex-start',
                transition: 'all 0.15s',
              }}
            >
              <span
                style={{
                  width: '1.2rem',
                  height: '1.2rem',
                  borderRadius: '999px',
                  background: '#fff',
                  boxShadow: '0 1px 4px rgba(0, 0, 0, 0.18)',
                  display: 'block',
                }}
              />
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isEnabled ? 'var(--accent)' : 'var(--muted)' }}>
              {isEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ marginBottom: '0.4rem' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>
          {field.name || field.id}
          {field.required && <span style={{ color: '#e53e3e', marginLeft: '0.25rem' }}>*</span>}
        </span>
        {field.description && (
          <MarkdownText
            text={field.description}
            style={{ color: 'var(--muted)', fontSize: '0.8125rem', marginTop: '0.2rem', lineHeight: 1.55 }}
          />
        )}
      </div>

      {field.type === 'select' && field.options && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {field.options.map(opt => (
            <button key={opt.value} style={selectedBtn(value === opt.value)} onClick={() => onChange(opt.value)}>
              <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{opt.label}</span>
            </button>
          ))}
        </div>
      )}

      {field.type === 'multi-select' && field.options && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem',
          maxHeight: '260px', overflowY: 'auto', paddingRight: '0.25rem',
        }}>
          {field.options.map(opt => {
            const sel = Array.isArray(value) ? (value as string[]).includes(opt.value) : false;
            return (
              <button
                key={opt.value}
                style={{ ...selectedBtn(sel), fontSize: '0.8125rem', padding: '0.45rem 0.6rem' }}
                onClick={() => {
                  const current = Array.isArray(value) ? (value as string[]) : [];
                  onChange(sel ? current.filter(v => v !== opt.value) : [...current, opt.value]);
                }}
              >
                {sel ? '✓ ' : ''}{opt.label}
              </button>
            );
          })}
        </div>
      )}

      {field.type === 'number' && (
        <input
          type="number"
          value={(value as number) ?? ''}
          onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          placeholder={String(field.default ?? '')}
          style={inputStyle}
        />
      )}

      {(field.type === 'string' || field.type === 'password') && (
        <input
          type={field.type === 'password' ? 'password' : 'text'}
          value={(value as string) ?? ''}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
        />
      )}
    </div>
  );
}
