import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  title?: string;
}

export function LoadingOverlay({ title = '正在加载数据…' }: LoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-[var(--color-backdrop)] backdrop-blur-[2px]">
      <Loader2 className="h-12 w-12 animate-spin text-[var(--color-primary)]" strokeWidth={1.5} />
      <p className="text-sm font-medium text-[var(--color-text-inverse)]">{title}</p>
    </div>
  );
}
