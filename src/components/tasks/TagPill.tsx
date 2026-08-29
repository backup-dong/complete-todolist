import { X } from 'lucide-react';

/**
 * 标签药丸：卡片展示（无 onRemove）与编辑器编辑（有 onRemove）共用。
 */
export function TagPill({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="badge border border-[var(--color-border)] bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)]">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`移除标签 ${label}`}
          className="ml-1 inline-flex items-center text-current transition-opacity hover:opacity-70"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
