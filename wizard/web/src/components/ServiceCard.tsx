import type { Service } from '../lib/services';
import { resolveLogoUrl } from '../lib/services';

interface Props {
  service: Service;
  selected: boolean;
  onToggle: () => void;
}

export function ServiceCard({ service, selected, onToggle }: Props) {
  const logoUrl = resolveLogoUrl(service.logo);
  return (
    <button
      className="wizard-hover-lift"
      onClick={onToggle}
      style={{
        padding: '0.75rem 0.5rem',
        border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: '12px',
        background: selected ? 'var(--panel-2)' : 'var(--panel)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem',
        cursor: 'pointer', transition: 'all 0.15s', color: 'var(--text)',
      }}
    >
      {logoUrl ? (
        <img src={logoUrl} alt={service.name} style={{ height: '28px', width: '100%', objectFit: 'contain' }} />
      ) : (
        <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--muted)' }}>{service.name[0]}</span>
      )}
      <span style={{ fontSize: '0.75rem', fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>{service.name}</span>
      {selected && <span style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700 }}>✓</span>}
    </button>
  );
}
