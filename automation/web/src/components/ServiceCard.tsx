import type { Service } from '../lib/services';

interface Props {
  service: Service;
  selected: boolean;
  onToggle: () => void;
}

export function ServiceCard({ service, selected, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      className={`p-3 border-2 rounded-xl flex flex-col items-center gap-1.5 transition-all ${
        selected
          ? 'border-accent bg-purple-50 shadow-sm'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {service.logo ? (
        <img src={service.logo} alt={service.name} className="h-7 w-full object-contain" />
      ) : (
        <span className="text-lg">📦</span>
      )}
      <span className="text-xs font-semibold text-center leading-tight">{service.name}</span>
      {selected && <span className="text-xs text-accent font-bold">✓</span>}
    </button>
  );
}
