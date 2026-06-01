import type { ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  Save,
  Settings2,
  Sparkles,
  Users,
  UserRound,
} from 'lucide-react';

interface Props {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
  icon?: ReactNode;
}

function getLeadingIcon(label: string) {
  if (/start/i.test(label)) return <Sparkles size={16} />;
  if (/finish/i.test(label)) return <Check size={16} />;
  if (/save/i.test(label)) return <Save size={16} />;
  if (/free|p2p|http|skip|shared/i.test(label)) return <Users size={16} />;
  if (/profile/i.test(label)) return <UserRound size={16} />;
  return <Settings2 size={16} />;
}

function getTrailingIcon(label: string) {
  if (/finish/i.test(label)) return <Check size={16} />;
  if (/save/i.test(label)) return <Save size={16} />;
  return <ArrowRight size={16} />;
}

export function NextButton({ onClick, disabled = false, label = 'Continue', icon }: Props) {
  return (
    <button
      type="button"
      className="wizard-primary-btn"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        marginTop: '1.5rem',
        padding: '0.75rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
      }}
    >
      <span className="wizard-primary-btn__icon" aria-hidden="true">{icon ?? getLeadingIcon(label)}</span>
      <span className="wizard-primary-btn__label">{label}</span>
      <span className="wizard-primary-btn__icon" aria-hidden="true">{getTrailingIcon(label)}</span>
    </button>
  );
}
