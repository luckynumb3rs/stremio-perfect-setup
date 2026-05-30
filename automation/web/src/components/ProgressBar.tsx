interface Props {
  sections: string[];
  currentSection: number;
}

export function ProgressBar({ sections, currentSection }: Props) {
  return (
    <div className="w-full mb-8">
      <div className="flex justify-between mb-2">
        {sections.map((s, i) => (
          <span
            key={s}
            className={`text-xs font-semibold transition-colors ${
              i < currentSection ? 'text-accent' :
              i === currentSection ? 'text-accent font-bold' :
              'text-gray-400'
            }`}
          >
            {i < currentSection ? '✓ ' : ''}{s}
          </span>
        ))}
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent to-accent-2 rounded-full transition-all duration-500"
          style={{ width: sections.length > 1 ? `${(currentSection / (sections.length - 1)) * 100}%` : '0%' }}
        />
      </div>
    </div>
  );
}
