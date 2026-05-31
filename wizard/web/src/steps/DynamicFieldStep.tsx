import { WizardShell } from '../components/WizardShell';
import { NextButton } from '../components/NextButton';
import { useWizard } from '../store/wizard';

// Plain JS module; TypeScript will allow this with allowJs:true in tsconfig
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { isVisible } from '@core/template-engine.js';

function getRealInputFields(template: unknown): unknown[] {
  const t = template as { metadata?: { inputs?: unknown[] } };
  return (t?.metadata?.inputs ?? []).filter(
    (f: unknown) => {
      const field = f as { type?: string };
      return field.type !== 'alert' && field.type !== 'socials';
    }
  );
}

function getPrecedingAlerts(template: unknown, targetFieldId: string): unknown[] {
  const t = template as { metadata?: { inputs?: unknown[] } };
  const all = t?.metadata?.inputs ?? [];
  const targetIdx = all.findIndex((f: unknown) => (f as { id?: string }).id === targetFieldId);
  if (targetIdx < 0) return [];
  const alerts: unknown[] = [];
  for (let i = targetIdx - 1; i >= 0; i--) {
    const f = all[i] as { type?: string };
    if (f.type === 'alert') alerts.unshift(all[i]);
    else break;
  }
  return alerts;
}

function AlertBanner({ field }: { field: unknown }) {
  const f = field as { id?: string; name?: string; description?: string; intent?: string };
  const colors: Record<string, string> = {
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-700',
    'info-basic': 'bg-gray-50 border-gray-200 text-gray-600',
  };
  const cls = colors[f.intent ?? ''] ?? colors['info-basic'];
  return (
    <div className={`rounded-lg border p-3 mb-3 text-sm ${cls}`}>
      {f.name && <strong className="block mb-1">{f.name}</strong>}
      <span>{f.description}</span>
    </div>
  );
}

interface Props { fieldIndex: number; }

export function DynamicFieldStep({ fieldIndex }: Props) {
  const { templates, aioStreamsInputs, credentials, setAioStreamsInput, nextStep } = useWizard();
  const template = templates?.aiostreams;

  if (!template) {
    return (
      <WizardShell>
        <p className="text-gray-400 text-sm">Loading template…</p>
      </WizardShell>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx: any = {
    inputs: aioStreamsInputs,
    services: credentials.debridServices.map((d: { id: string }) => d.id),
  };

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const realFields = getRealInputFields(template).filter(f => isVisible(f, ctx));
  const field = realFields[fieldIndex] as Record<string, unknown> | undefined;

  // Consumed all visible fields; advance automatically
  if (!field) {
    nextStep();
    return null;
  }

  const precedingAlerts = getPrecedingAlerts(template, field.id as string);
  const rawValue = aioStreamsInputs[field.id as string];
  const value = rawValue !== undefined ? rawValue : field.default;

  function onChange(val: unknown) {
    setAioStreamsInput(field!.id as string, val);
  }

  const opts = field.options as { value: string; label: string }[] | undefined;

  return (
    <WizardShell>
      {precedingAlerts.map((a, i) => <AlertBanner key={i} field={a} />)}

      <h2 className="text-xl font-bold mb-1">{(field.name as string) || (field.id as string)}</h2>
      {!!field.description && (
        <p className="text-gray-500 text-sm mb-4 leading-relaxed">{field.description as string}</p>
      )}

      {field.type === 'select' && opts && (
        <div className="flex flex-col gap-2">
          {opts.map(opt => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`px-4 py-3 border-2 rounded-xl text-left transition-all ${
                value === opt.value ? 'border-accent bg-purple-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="font-medium">{opt.label}</span>
            </button>
          ))}
        </div>
      )}

      {field.type === 'boolean' && (
        <button
          onClick={() => onChange(!value)}
          className={`w-full px-4 py-3 border-2 rounded-xl text-left transition-all ${
            value ? 'border-accent bg-purple-50' : 'border-gray-200 hover:border-gray-200'
          }`}
        >
          <span className="font-medium">{value ? '✅ Enabled' : '☐ Disabled'}</span>
          <span className="text-xs text-gray-400 block mt-0.5">Click to toggle</span>
        </button>
      )}

      {field.type === 'multi-select' && opts && (
        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
          {opts.map(opt => {
            const sel = Array.isArray(value) ? (value as string[]) : [];
            const checked = sel.includes(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => {
                  const next = checked
                    ? sel.filter(v => v !== opt.value)
                    : [...sel, opt.value];
                  onChange(next);
                }}
                className={`px-3 py-2 border-2 rounded-lg text-sm text-left transition-all ${
                  checked ? 'border-accent bg-purple-50' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {checked ? '✓ ' : ''}{opt.label}
              </button>
            );
          })}
        </div>
      )}

      {(field.type === 'number' || field.type === 'string' || field.type === 'url' || field.type === 'password') && (
        <input
          type={field.type === 'number' ? 'number' : field.type === 'password' ? 'password' : 'text'}
          value={(value ?? '') as string | number}
          onChange={e => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
          placeholder={String(field.default ?? '')}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      )}

      <NextButton onClick={nextStep} />
    </WizardShell>
  );
}
