import { useRef, useState, useCallback } from 'react';
import { Eye, Pencil, Maximize } from 'lucide-react';
import { MarkdownPreview } from './MarkdownPreview';
import { NoteToolbar } from './NoteToolbar';
import { NoteEditorDialog } from './NoteEditorDialog';
import { InsertTableDialog } from './InsertTableDialog';
import { InsertLinkDialog } from './InsertLinkDialog';
import { InsertImageDialog } from './InsertImageDialog';

interface NoteEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

function insertFormat(value: string, selStart: number, selEnd: number, type: string, extra?: { rows?: number; cols?: number; text?: string; url?: string; alt?: string }): { newValue: string; newCursor: number } {
  const selected = value.substring(selStart, selEnd);
  const before = value.substring(0, selStart);
  const after = value.substring(selEnd);

  const getLineStart = () => {
    let i = selStart - 1;
    while (i >= 0 && value[i] !== '\n') i--;
    return i + 1;
  };

  switch (type) {
    case 'bold': {
      const marker = '****';
      const wrapped = selected ? `**${selected}**` : marker;
      return { newValue: before + wrapped + after, newCursor: selected ? selStart + wrapped.length : selStart + 2 };
    }
    case 'italic': {
      const marker = '**';
      const wrapped = selected ? `*${selected}*` : marker;
      return { newValue: before + wrapped + after, newCursor: selected ? selStart + wrapped.length : selStart + 1 };
    }
    case 'heading1':
    case 'heading2':
    case 'heading3': {
      const ls = getLineStart();
      const prefix = type === 'heading1' ? '# ' : type === 'heading2' ? '## ' : '### ';
      const line = value.substring(ls, selEnd || selStart);
      const cleaned = line.replace(/^#+\s*/, '');
      const newVal = value.substring(0, ls) + prefix + cleaned + value.substring(selEnd || selStart);
      return { newValue: newVal, newCursor: ls + prefix.length + cleaned.length };
    }
    case 'link': {
      if (extra?.text && extra?.url) {
        const wrapped = `[${extra.text}](${extra.url})`;
        return { newValue: before + wrapped + after, newCursor: selStart + wrapped.length };
      }
      return { newValue: before + after, newCursor: selStart };
    }
    case 'image': {
      if (extra?.url) {
        const wrapped = `![${extra.alt || ''}](${extra.url})`;
        return { newValue: before + wrapped + after, newCursor: selStart + wrapped.length };
      }
      return { newValue: before + after, newCursor: selStart };
    }
    case 'table': {
      const r = extra?.rows || 3;
      const c = extra?.cols || 3;
      const headers = Array.from({ length: c }, (_, i) => ` Header ${i + 1} `);
      const separators = Array.from({ length: c }, () => '---');
      const rows = Array.from({ length: r }, (_, ri) =>
        Array.from({ length: c }, (_, ci) => ` Cell ${ri * c + ci + 1} `)
      );
      const tableStr = '\n|' + headers.join('|') + '|\n|' + separators.join('|') + '|\n' +
        rows.map(row => '|' + row.join('|') + '|').join('\n') + '\n';
      return { newValue: before + tableStr + after, newCursor: selStart + tableStr.length };
    }
    case 'ordered-list': {
      const ls = getLineStart();
      const prefix = '1. ';
      const newVal = value.substring(0, ls) + prefix + selected + value.substring(selEnd || selStart);
      return { newValue: newVal, newCursor: ls + prefix.length + (selected || '').length };
    }
    case 'unordered-list': {
      const ls = getLineStart();
      const prefix = '- ';
      const newVal = value.substring(0, ls) + prefix + selected + value.substring(selEnd || selStart);
      return { newValue: newVal, newCursor: ls + prefix.length + (selected || '').length };
    }
    case 'task-list': {
      const ls = getLineStart();
      const prefix = '- [ ] ';
      const newVal = value.substring(0, ls) + prefix + (selected || '') + value.substring(selEnd || selStart);
      return { newValue: newVal, newCursor: ls + prefix.length + (selected || '').length };
    }
    case 'code-block': {
      const marker = '\n```\n\n```\n';
      const wrapped = selected ? `\n\`\`\`\n${selected}\n\`\`\`\n` : marker;
      return { newValue: before + wrapped + after, newCursor: selected ? selStart + wrapped.length : selStart + 5 };
    }
    default:
      return { newValue: value, newCursor: selStart };
  }
}

export function NoteEditor({ value, onChange, placeholder = '备注（Markdown）', rows = 4, className = '' }: NoteEditorProps) {
  const [mode, setMode] = useState<'edit' | 'preview'>('preview');
  const [fullscreen, setFullscreen] = useState(false);
  const [dialog, setDialog] = useState<'table' | 'link' | 'image' | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleFormat = useCallback((type: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const selStart = ta.selectionStart;
    const selEnd = ta.selectionEnd;

    if (type === 'table') { setDialog('table'); return; }
    if (type === 'link') { setDialog('link'); return; }
    if (type === 'image') { setDialog('image'); return; }

    const { newValue, newCursor } = insertFormat(value, selStart, selEnd, type);
    onChange(newValue);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
    });
  }, [value, onChange]);

  const handleTableInsert = useCallback((r: number, c: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const selStart = ta.selectionStart;
    const selEnd = ta.selectionEnd;
    const { newValue, newCursor } = insertFormat(value, selStart, selEnd, 'table', { rows: r, cols: c });
    onChange(newValue);
    setDialog(null);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(newCursor, newCursor); });
  }, [value, onChange]);

  const handleLinkInsert = useCallback((text: string, url: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const selStart = ta.selectionStart;
    const selEnd = ta.selectionEnd;
    const { newValue, newCursor } = insertFormat(value, selStart, selEnd, 'link', { text, url });
    onChange(newValue);
    setDialog(null);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(newCursor, newCursor); });
  }, [value, onChange]);

  const handleImageInsert = useCallback((alt: string, url: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const selStart = ta.selectionStart;
    const selEnd = ta.selectionEnd;
    const { newValue, newCursor } = insertFormat(value, selStart, selEnd, 'image', { alt, url });
    onChange(newValue);
    setDialog(null);
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(newCursor, newCursor); });
  }, [value, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    const isCtrl = e.ctrlKey || e.metaKey;
    if (isCtrl && e.key === 'b') { e.preventDefault(); handleFormat('bold'); }
    if (isCtrl && e.key === 'i') { e.preventDefault(); handleFormat('italic'); }
    if (isCtrl && e.key === 'k') { e.preventDefault(); handleFormat('link'); }
  }, [handleFormat]);

  return (
    <div className={`rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface)] ${className}`}>
      {mode === 'preview' ? (
        <div className="flex items-center justify-end border-b border-[var(--color-border-subtle)] px-3 py-1.5">
          <button
            type="button"
            onClick={() => setMode('edit')}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          >
            <Pencil className="h-3 w-3" />
            编辑
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)]">
          <div className="relative flex-1">
            <NoteToolbar onFormat={handleFormat} />
            {dialog === 'table' && (
              <InsertTableDialog onInsert={handleTableInsert} onClose={() => setDialog(null)} />
            )}
            {dialog === 'link' && (
              <InsertLinkDialog onInsert={handleLinkInsert} onClose={() => setDialog(null)} />
            )}
            {dialog === 'image' && (
              <InsertImageDialog onInsert={handleImageInsert} onClose={() => setDialog(null)} />
            )}
          </div>
          <div className="flex items-center gap-1 px-3 py-1.5">
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="inline-flex items-center rounded px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
              title="全屏编辑"
            >
              <Maximize className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setMode('preview')}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
            >
              <Eye className="h-3 w-3" />
              预览
            </button>
          </div>
        </div>
      )}
      {mode === 'edit' ? (
        <div className="p-3">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={rows}
            className="input min-h-[80px] resize-y"
            style={{ height: 'auto' }}
            autoFocus
          />
        </div>
      ) : (
        <div className="p-3 cursor-pointer" onClick={() => setMode('edit')}>
          <MarkdownPreview content={value} />
        </div>
      )}

      <NoteEditorDialog
        open={fullscreen}
        value={value}
        onChange={onChange}
        onClose={() => setFullscreen(false)}
      />
    </div>
  );
}
