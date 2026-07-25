import { useState } from 'react';

interface InsertTableDialogProps {
  onInsert: (rows: number, cols: number) => void;
  onClose: () => void;
}

export function InsertTableDialog({ onInsert, onClose }: InsertTableDialogProps) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);

  return (
    <div className="absolute top-full left-0 z-20 mt-1 w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3 shadow-lg">
      <div className="mb-3 text-sm font-medium text-[var(--color-text)]">插入表格</div>
      <div className="mb-3 flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
          行
          <input
            type="number"
            min={1}
            max={20}
            value={rows}
            onChange={(e) => setRows(Math.max(1, Math.min(20, Number(e.target.value))))}
            className="w-14 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
          列
          <input
            type="number"
            min={1}
            max={10}
            value={cols}
            onChange={(e) => setCols(Math.max(1, Math.min(10, Number(e.target.value))))}
            className="w-14 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
          />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => onInsert(rows, cols)}
          className="rounded bg-[var(--color-primary)] px-2.5 py-1 text-xs text-[var(--color-text-inverse)]"
        >
          插入
        </button>
      </div>
    </div>
  );
}
