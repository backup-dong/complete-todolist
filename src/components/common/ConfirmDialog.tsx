import { X } from 'lucide-react';
import { useConfirmStore } from '@/stores/confirmStore';

export function ConfirmDialog() {
  const { open, message, close } = useConfirmStore();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => close(false)}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--color-text)]">确认</h2>
          <button
            type="button"
            onClick={() => close(false)}
            className="rounded-md p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-6 text-sm text-[var(--color-text-secondary)]">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => close(false)}
            className="btn-secondary px-4 py-2 text-sm"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            data-testid="confirm-ok"
            className="btn-danger px-4 py-2 text-sm"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
