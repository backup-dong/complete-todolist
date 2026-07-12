import { useRef } from 'react';
import { X } from 'lucide-react';

interface DateInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function DateInput({ value, onChange, className = '' }: DateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    const input = inputRef.current;
    if (!input || typeof input.showPicker !== 'function') return;
    // 仅在桌面端主动唤起选择器；移动端由系统默认行为处理
    if (window.matchMedia('(pointer: fine)').matches) {
      try {
        input.showPicker();
      } catch {
        // 浏览器可能因选择器已打开等原因拒绝，忽略即可
      }
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={handleClick}
        className={`input w-full min-w-0 appearance-none pr-12 ${className}`}
      />
      {value && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          onPointerDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            inputRef.current?.blur();
            onChange('');
          }}
          className="absolute right-3 top-1/2 z-10 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
          aria-label="清空日期"
          title="清空日期"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
