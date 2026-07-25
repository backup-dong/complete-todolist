import { useRef, useCallback, useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { NoteToolbar } from './NoteToolbar';
import { MarkdownPreview } from './MarkdownPreview';
import { InsertTableDialog } from './InsertTableDialog';
import { InsertLinkDialog } from './InsertLinkDialog';
import { InsertImageDialog } from './InsertImageDialog';

interface NoteEditorDialogProps {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
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

export function NoteEditorDialog({ open, value, onChange, onClose }: NoteEditorDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [dialog, setDialog] = useState<'table' | 'link' | 'image' | null>(null);

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

  const handleTableInsert = useCallback((rows: number, cols: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const selStart = ta.selectionStart;
    const selEnd = ta.selectionEnd;
    const { newValue, newCursor } = insertFormat(value, selStart, selEnd, 'table', { rows, cols });
    onChange(newValue);
    setDialog(null);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
    });
  }, [value, onChange]);

  const handleLinkInsert = useCallback((text: string, url: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const selStart = ta.selectionStart;
    const selEnd = ta.selectionEnd;
    const { newValue, newCursor } = insertFormat(value, selStart, selEnd, 'link', { text, url });
    onChange(newValue);
    setDialog(null);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
    });
  }, [value, onChange]);

  const handleImageInsert = useCallback((alt: string, url: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const selStart = ta.selectionStart;
    const selEnd = ta.selectionEnd;
    const { newValue, newCursor } = insertFormat(value, selStart, selEnd, 'image', { alt, url });
    onChange(newValue);
    setDialog(null);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newCursor, newCursor);
    });
  }, [value, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const isCtrl = e.ctrlKey || e.metaKey;
    if (isCtrl && e.key === 'b') { e.preventDefault(); handleFormat('bold'); }
    if (isCtrl && e.key === 'i') { e.preventDefault(); handleFormat('italic'); }
    if (isCtrl && e.key === 'k') { e.preventDefault(); handleFormat('link'); }
  }, [handleFormat]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (dialog && e.key === 'Escape') {
        e.stopPropagation();
        setDialog(null);
      }
    };
    if (dialog) {
      document.addEventListener('keydown', handleEsc, true);
      return () => document.removeEventListener('keydown', handleEsc, true);
    }
  }, [dialog]);

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--color-backdrop)] backdrop-blur-sm" />
        <div className="fixed inset-0 z-50 flex pointer-events-none p-4">
          <Dialog.Content
            className="pointer-events-auto z-50 flex h-full w-full flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-lg outline-none"
            aria-describedby={undefined}
            onKeyDown={(e) => {
              if (dialog && e.key === 'Escape') {
                e.preventDefault();
                setDialog(null);
              }
            }}
            key={open ? 'open' : 'closed'}
          >
            <Dialog.Title className="sr-only">全屏备注编辑</Dialog.Title>

            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)]">
              <div className="relative flex-1">
                <NoteToolbar onFormat={handleFormat} />
                {dialog === 'table' && (
                  <InsertTableDialog
                    onInsert={handleTableInsert}
                    onClose={() => setDialog(null)}
                  />
                )}
                {dialog === 'link' && (
                  <InsertLinkDialog
                    onInsert={handleLinkInsert}
                    onClose={() => setDialog(null)}
                  />
                )}
                {dialog === 'image' && (
                  <InsertImageDialog
                    onInsert={handleImageInsert}
                    onClose={() => setDialog(null)}
                  />
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mr-3 rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              <div className="flex w-1/2 flex-col">
                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="备注（Markdown）"
                  className="h-full w-full resize-none border-0 bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-muted)]"
                  autoFocus
                />
              </div>
              <div className="w-1/2 overflow-y-auto border-l border-[var(--color-border-subtle)] bg-[var(--color-surface)] p-4">
                <MarkdownPreview content={value} />
              </div>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
