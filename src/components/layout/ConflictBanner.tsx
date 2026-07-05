import { AlertTriangle } from 'lucide-react';
import { useSyncStore } from '@/stores/syncStore';

export function ConflictBanner() {
  const { conflictFiles, resolveConflict } = useSyncStore();

  if (conflictFiles.length === 0) return null;

  return (
    <div className="border-b border-[var(--color-warning)] bg-[var(--color-warning-subtle)] px-4 py-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-warning)]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--color-text)]">
            检测到 {conflictFiles.length} 个文件在远端有更新，可能存在冲突
          </p>
          <div className="mt-2 space-y-2">
            {conflictFiles.map((fileName) => (
              <div
                key={fileName}
                className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-warning)]/30 bg-[var(--color-surface)] px-3 py-2"
              >
                <span className="truncate text-xs text-[var(--color-text-secondary)]">{fileName}</span>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => resolveConflict(fileName, 'remote')}
                    className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  >
                    放弃本地
                  </button>
                  <button
                    type="button"
                    onClick={() => resolveConflict(fileName, 'local')}
                    className="text-xs font-medium text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
                  >
                    使用本地
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
