import { X } from 'lucide-react';

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function DateInput({ value, onChange, className = '' }: DateInputProps) {
  return (
    <div className="relative">
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`input w-full min-w-0 appearance-none pr-12 ${className}`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
          aria-label="清空日期"
          title="清空日期"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
