import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToastStore } from '@/stores/toastStore';
import type { ToastItem, ToastType } from '@/stores/toastStore';

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const STYLES: Record<ToastType, string> = {
  success:
    'border-[var(--color-success)]/20 bg-[var(--color-success-subtle)] text-[var(--color-success)]',
  error:
    'border-[var(--color-danger)]/20 bg-[var(--color-danger-subtle)] text-[var(--color-danger)]',
  info:
    'border-[var(--color-primary)]/20 bg-[var(--color-primary-subtle)] text-[var(--color-primary)]',
};

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const Icon = ICONS[toast.type];

  return (
    <div
      role="status"
      className={[
        'animate-toast-enter pointer-events-auto flex max-w-xs items-center gap-2 rounded-full border px-4 py-2 shadow-md',
        STYLES[toast.type],
      ].join(' ')}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-sm font-medium">{toast.message}</span>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="-mr-1 rounded-full p-1 opacity-70 hover:opacity-100"
        aria-label="关闭提示"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed left-1/2 top-4 z-50 flex -translate-x-1/2 flex-col items-center gap-2"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={dismiss} />
      ))}
    </div>
  );
}
