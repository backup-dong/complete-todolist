import { useState } from 'react';

interface InsertImageDialogProps {
  onInsert: (alt: string, url: string) => void;
  onClose: () => void;
}

export function InsertImageDialog({ onInsert, onClose }: InsertImageDialogProps) {
  const [alt, setAlt] = useState('');
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url) {
      onInsert(alt, url);
    }
  };

  return (
    <div className="absolute top-full left-0 z-20 mt-1 w-72 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3 shadow-lg">
      <div className="mb-3 text-sm font-medium text-[var(--color-text)]">插入图片</div>
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          value={alt}
          onChange={(e) => setAlt(e.target.value)}
          placeholder="图片描述（alt 文本）"
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)]"
          autoFocus
        />
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/image.png"
          className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)]"
        />
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2.5 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={!url}
            className="rounded bg-[var(--color-primary)] px-2.5 py-1 text-xs text-[var(--color-text-inverse)] disabled:opacity-50"
          >
            插入
          </button>
        </div>
      </form>
    </div>
  );
}
