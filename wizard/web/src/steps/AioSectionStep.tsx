import { useState, type CSSProperties, type ReactNode } from 'react';
import { ListChecks, ChevronDown, KeyRound } from 'lucide-react';
import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { MarkdownText } from '../components/MarkdownText';
import { useWizard } from '../store/wizard';
import type { AioSubsectionItem } from '../lib/aioSections';

// @ts-ignore
import { isVisible as isVisibleRaw } from '@core/template-engine.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isVisible = isVisibleRaw as (field: any, ctx: { inputs: Record<string, any>; services: string[] }) => boolean;

// Direct link to where a Debridio user finds the API key used by the Debridio AIOStreams addon.
const DEBRIDIO_API_KEY_URL = 'https://debridio.com/account';

interface TemplateField {
  id: string;
  name?: string;
  description?: string;
  type?: string;
  required?: boolean;
  default?: unknown;
  options?: { value: string; label: string }[];
  intent?: string;
  constraints?: { min?: number; max?: number; forceInUi?: boolean };
  subOptions?: TemplateField[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = { inputs: Record<string, any>; services: string[] };

/** Read a possibly-nested input value by dotted id (e.g. "bitrate.bitrateCap"). */
function readNested(inputs: Record<string, unknown>, id: string): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return id.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), inputs);
}

function isEmptyValue(val: unknown): boolean {
  if (Array.isArray(val)) return val.length === 0;
  return val === undefined || val === null || val === '';
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
  const { templates, aioSections, aioStreamsInputs, credentials, setAioStreamsInput, nextStep, target, instantDebrid } = useWizard();
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

  // Instant Debrid configures AIOStreams as a P2P setup (the debrid is resolved at the
  // platform layer), so visibility must use the same empty service list the install will
  // resolve with — otherwise debrid-only fields (Anime, Debridio) would be shown here yet
  // silently dropped at install. Keep this in sync with InstallingStep's `useInstantDebrid`.
  const useInstantDebrid = target === 'nuvio' && instantDebrid;
  const ctx: Ctx = {
    inputs: aioStreamsInputs,
    services: useInstantDebrid ? [] : credentials.debridServices.map((d: { id: string }) => d.id),
  };

  const headerField = section.headerField as TemplateField | null;
  const alertFields = section.alertFields as TemplateField[];
  const sectionAlerts: TemplateField[] = alertFields.filter((f: TemplateField) => isVisible(f, ctx));

  // Resolve a subsection's visible child fields (looked up within its own subOptions,
  // since child ids can collide across subsections).
  const subVisibleChildren = (sub: AioSubsectionItem): TemplateField[] => {
    const childById = Object.fromEntries(
      ((sub.headerField as TemplateField)?.subOptions ?? []).map((o) => [o.id, o]),
    );
    return sub.fieldIds
      .map((id) => childById[id])
      .filter(Boolean)
      .filter((f) => isVisible(f, ctx));
  };

  // Block continue if any visible required field (top-level or inside a visible
  // subsection) is empty.
  const isBlocked = section.items.some((item) => {
    if (item.kind === 'field') {
      const f = inputsById[item.id];
      if (!f || !f.required || !isVisible(f, ctx)) return false;
      return isEmptyValue(readNested(aioStreamsInputs, item.id) ?? f.default);
    }
    // subsection
    if (!isVisible(inputsById[item.id] ?? item.headerField, ctx)) return false;
    return subVisibleChildren(item).some((cf) => {
      if (!cf.required) return false;
      return isEmptyValue(readNested(aioStreamsInputs, `${item.id}.${cf.id}`) ?? cf.default);
    });
  });

  const visibleFieldItems = section.items.filter((item) =>
    item.kind === 'field' ? isVisible(inputsById[item.id] ?? { id: item.id }, ctx) : true,
  );

  return (
    <WizardShell onSubmit={isBlocked ? undefined : nextStep}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)', marginBottom: '1rem', textAlign: 'center' }}>
        {section.icon} {section.title}
      </h2>

      {headerField?.description && <AlertBanner field={headerField} />}
      {sectionAlerts.map((field) => <AlertBanner key={field.id} field={field} />)}

      {visibleFieldItems.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
          No options to configure for your current setup.
        </p>
      )}

      {section.items.map((item) => {
        if (item.kind === 'subsection') {
          return (
            <SubsectionGroup
              key={item.id}
              sub={item}
              ctx={ctx}
              childFields={subVisibleChildren(item)}
              subsectionField={(inputsById[item.id] ?? item.headerField) as TemplateField}
              readValue={(id) => readNested(aioStreamsInputs, id)}
              setValue={setAioStreamsInput}
            />
          );
        }
        const field = inputsById[item.id];
        if (!field || !isVisible(field, ctx)) return null;
        // The Debridio API key is rendered inside the Debridio toggle card (as its footer),
        // not as a standalone field below it.
        if (field.id === 'debridioApiKey') return null;
        return (
          <FieldRenderer
            key={field.id}
            field={field}
            value={readNested(aioStreamsInputs, field.id) ?? field.default}
            onChange={(val: unknown) => setAioStreamsInput(field.id, val)}
            footer={field.id === 'debridio' ? (
              <DebridioKeyField
                value={(readNested(aioStreamsInputs, 'debridioApiKey') as string) ?? ''}
                onChange={(v) => setAioStreamsInput('debridioApiKey', v)}
                required={Boolean(inputsById['debridioApiKey']?.required)}
              />
            ) : undefined}
          />
        );
      })}

      <NextButton onClick={nextStep} disabled={isBlocked} icon={<ListChecks size={16} />} />
    </WizardShell>
  );
}

interface SubsectionProps {
  sub: AioSubsectionItem;
  ctx: Ctx;
  childFields: TemplateField[];
  subsectionField: TemplateField;
  readValue: (id: string) => unknown;
  setValue: (id: string, value: unknown) => void;
}

/** A collapsible group of fields rendered within a page. Advanced subsections start collapsed. */
function SubsectionGroup({ sub, ctx, childFields, subsectionField, readValue, setValue }: SubsectionProps) {
  // Hidden entirely when the subsection's own __if is false.
  if (subsectionField && !isVisible(subsectionField, ctx)) return null;
  // Subsections are collapsed by default so each page stays scannable.
  const [open, setOpen] = useState(false);
  const alerts = (sub.alertFields as TemplateField[]).filter((a) => isVisible(a, ctx));

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '12px', marginBottom: '1rem', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.85rem 1rem', background: 'var(--panel-2)', border: 'none', cursor: 'pointer',
          color: 'var(--text)', fontWeight: 600, fontSize: '0.9rem', textAlign: 'left',
        }}
      >
        <span>{sub.title}</span>
        <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', flex: '0 0 auto' }} />
      </button>
      {open && (
        <div style={{ padding: '0.85rem 1rem 0.1rem' }}>
          {sub.description && (
            <MarkdownText
              text={sub.description}
              style={{ color: 'var(--muted)', fontSize: '0.8125rem', marginBottom: '0.85rem', lineHeight: 1.55 }}
            />
          )}
          {alerts.map((a) => <AlertBanner key={a.id} field={a} />)}
          {childFields.map((cf) => (
            <FieldRenderer
              key={cf.id}
              field={cf}
              value={readValue(`${sub.id}.${cf.id}`) ?? cf.default}
              onChange={(val: unknown) => setValue(`${sub.id}.${cf.id}`, val)}
            />
          ))}
          {childFields.length === 0 && (
            <p style={{ color: 'var(--muted)', fontSize: '0.8125rem', marginBottom: '0.85rem' }}>
              No options to configure here for your current setup.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface FieldProps {
  field: TemplateField;
  value: unknown;
  onChange: (v: unknown) => void;
  /** Extra content rendered inside a boolean field's card, below the toggle, only when enabled. */
  footer?: ReactNode;
}

/** Debridio API key input with a "Get API Key" link, rendered inside the Debridio toggle card. */
function DebridioKeyField({ value, onChange, required }: { value: string; onChange: (v: string) => void; required: boolean }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)' }}>
        Debridio API Key{required && <span style={{ color: '#e53e3e', marginLeft: '0.2rem' }}>*</span>}
      </span>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem', alignItems: 'stretch' }}>
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste your Debridio API key..."
          style={{
            flex: 1, border: '1px solid var(--border)', borderRadius: '8px',
            padding: '0.5rem 0.75rem', fontSize: '0.875rem',
            background: 'var(--panel)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
          }}
        />
        <a
          href={DEBRIDIO_API_KEY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="wizard-secondary-btn"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            padding: '0.5rem 0.75rem', fontSize: '0.8125rem',
            whiteSpace: 'nowrap', textDecoration: 'none',
          }}
        >
          <KeyRound size={14} style={{ flex: '0 0 auto' }} />
          Get API Key
        </a>
      </div>
    </label>
  );
}

function FieldRenderer({ field, value, onChange, footer }: FieldProps) {
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

  // Long option lists (selects/multi-selects) render as a compact 2-column scrollable
  // grid; short lists keep the roomy single-column layout.
  const compactOptions = (field.options?.length ?? 0) > 10;
  const optionsContainerStyle: CSSProperties = compactOptions
    ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem', maxHeight: '260px', overflowY: 'auto', paddingRight: '0.25rem' }
    : { display: 'flex', flexDirection: 'column', gap: '0.4rem' };
  const optionBtnStyle = (sel: boolean): CSSProperties =>
    compactOptions ? { ...selectedBtn(sel), fontSize: '0.8125rem', padding: '0.45rem 0.6rem' } : selectedBtn(sel);

  if (field.type === 'boolean') {
    return (
      <div style={{ marginBottom: '1.25rem' }}>
        <div
          className={`wizard-hover-lift${isEnabled ? '' : ' wizard-hover-lift--guide'}`}
          style={{
            '--wizard-hover-selected-bg': 'var(--panel-2)',
            '--wizard-hover-selected-border': 'var(--accent)',
            '--wizard-hover-selected-color': 'var(--text)',
            borderRadius: '14px',
            border: `2px solid ${isEnabled ? 'var(--accent)' : 'var(--border)'}`,
            background: isEnabled ? 'var(--panel-2)' : 'var(--panel)',
            transition: 'all 0.15s',
            overflow: 'hidden',
          } as CSSProperties}
        >
          <button
            type="button"
            onClick={() => onChange(!value)}
            aria-pressed={isEnabled}
            style={{
              width: '100%',
              border: 'none',
              background: 'transparent',
              color: 'var(--text)',
              cursor: 'pointer',
              textAlign: 'left',
              padding: '0.95rem 1rem',
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
                    display: 'block',
                  }}
                />
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: isEnabled ? 'var(--accent)' : 'var(--muted)' }}>
                {isEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </button>

          {isEnabled && footer && (
            <div style={{ borderTop: '1px solid var(--accent)', padding: '0.85rem 1rem' }}>
              {footer}
            </div>
          )}
        </div>
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
        <div style={optionsContainerStyle}>
          {field.options.map(opt => (
            <button
              key={opt.value}
              type="button"
              className={`wizard-hover-lift${value === opt.value ? '' : ' wizard-hover-lift--guide'}`}
              style={{
                ...optionBtnStyle(value === opt.value),
                '--wizard-hover-selected-bg': 'var(--panel-2)',
                '--wizard-hover-selected-border': 'var(--accent)',
                '--wizard-hover-selected-color': 'var(--text)',
              } as CSSProperties}
              onClick={() => onChange(opt.value)}
            >
              <span style={{ fontWeight: 500, fontSize: compactOptions ? '0.8125rem' : '0.875rem' }}>{opt.label}</span>
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
                type="button"
                className={`wizard-hover-lift${sel ? '' : ' wizard-hover-lift--guide'}`}
                style={{
                  ...selectedBtn(sel),
                  fontSize: '0.8125rem',
                  padding: '0.45rem 0.6rem',
                  '--wizard-hover-selected-bg': 'var(--panel-2)',
                  '--wizard-hover-selected-border': 'var(--accent)',
                  '--wizard-hover-selected-color': 'var(--text)',
                } as CSSProperties}
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

      {field.type === 'select-with-custom' && field.options && (() => {
        const matchesOption = field.options.some(o => o.value === String(value));
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={optionsContainerStyle}>
              {field.options.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`wizard-hover-lift${String(value) === opt.value ? '' : ' wizard-hover-lift--guide'}`}
                  style={{
                    ...optionBtnStyle(String(value) === opt.value),
                    '--wizard-hover-selected-bg': 'var(--panel-2)',
                    '--wizard-hover-selected-border': 'var(--accent)',
                    '--wizard-hover-selected-color': 'var(--text)',
                  } as CSSProperties}
                  onClick={() => onChange(opt.value)}
                >
                  <span style={{ fontWeight: 500, fontSize: compactOptions ? '0.8125rem' : '0.875rem' }}>{opt.label}</span>
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Custom value…"
              value={matchesOption ? '' : (value as string) ?? ''}
              onChange={e => onChange(e.target.value)}
              style={{ ...inputStyle, marginTop: '0.15rem' }}
            />
          </div>
        );
      })()}

      {field.type === 'number' && (
        <input
          type="number"
          value={(value as number) ?? ''}
          min={field.constraints?.min}
          max={field.constraints?.max}
          onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          placeholder={String(field.default ?? '')}
          style={inputStyle}
        />
      )}

      {(field.type === 'string' || field.type === 'password' || field.type === 'url') && (
        <input
          type={field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text'}
          value={(value as string) ?? ''}
          minLength={field.constraints?.min}
          maxLength={field.constraints?.max}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
        />
      )}

      {!KNOWN_FIELD_TYPES.has(field.type ?? '') && (
        <p style={{
          background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: '8px',
          padding: '0.6rem 0.8rem', fontSize: '0.8125rem', color: 'var(--muted)', margin: 0,
        }}>
          Configure <strong>{field.name || field.id}</strong> directly in AIOStreams.
          The <code style={{ margin: '0 0.25rem' }}>{field.type}</code> option type is not supported in this wizard.
        </p>
      )}
    </div>
  );
}

// Field types FieldRenderer can render a control for. Anything else (e.g. oauth,
// custom-nntp-servers) falls back to an "configure in AIOStreams" placeholder.
const KNOWN_FIELD_TYPES = new Set([
  'boolean', 'select', 'multi-select', 'number', 'string', 'password', 'url', 'select-with-custom',
]);
