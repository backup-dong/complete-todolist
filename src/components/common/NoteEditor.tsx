import { useState } from 'react';
import { Eye, Pencil } from 'lucide-react';
import { MarkdownPreview } from './MarkdownPreview';

interface NoteEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

export function NoteEditor({ value, onChange, placeholder = '备注（Markdown）', rows = 4 }: NoteEditorProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-end gap-1 border-b border-[var(--color-border-subtle)] px-3 py-1.5">
        <button
          type="button"
          onClick={() => setMode('edit')}
          className={[
            'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
            mode === 'edit'
              ? 'bg-[var(--color-primary)] text-white'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]',
          ].join(' ')}
          aria-pressed={mode === 'edit'}
          aria-label="编辑"
        >
          <Pencil className="h-3 w-3" />
          编辑
        </button>
        <button
          type="button"
          onClick={() => setMode('preview')}
          className={[
            'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
            mode === 'preview'
              ? 'bg-[var(--color-primary)] text-white'
              : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]',
          ].join(' ')}
          aria-pressed={mode === 'preview'}
          aria-label="预览"
        >
          <Eye className="h-3 w-3" />
          预览
        </button>
      </div>

      <div className="p-3">
        {mode === 'edit' ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={rows}
            className="input min-h-[80px] resize-y"
          />
        ) : (
          <MarkdownPreview content={value} />
        )}
      </div>
    </div>
  );
}
