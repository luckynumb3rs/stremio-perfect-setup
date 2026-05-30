interface Props {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}

export function NextButton({ onClick, disabled = false, label = 'Continue →' }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full mt-6 py-3 px-6 bg-gradient-to-r from-accent to-accent-2 text-white
        font-semibold rounded-xl shadow-md hover:opacity-90 active:scale-[0.98]
        transition-all disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );
}
