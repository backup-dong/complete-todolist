import { useState, useRef, useEffect } from 'react';
import { Bold, Italic, Link, Image, Table, List, ListOrdered, CheckSquare, Code } from 'lucide-react';

interface NoteToolbarProps {
  onFormat: (type: string) => void;
}

function ToolbarSeparator() {
  return <div className="mx-1 h-4 w-px bg-[var(--color-border-subtle)]" />;
}

export function NoteToolbar({ onFormat }: NoteToolbarProps) {
  const [headingOpen, setHeadingOpen] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!headingOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (headingRef.current && !headingRef.current.contains(e.target as Node)) {
        setHeadingOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [headingOpen]);

  return (
    <div className="flex items-center gap-0.5 px-2 py-1">
      <Btn icon={Bold} onClick={() => onFormat('bold')} title="加粗 (Ctrl+B)" />
      <Btn icon={Italic} onClick={() => onFormat('italic')} title="斜体 (Ctrl+I)" />

      <div className="relative" ref={headingRef}>
        <button
          type="button"
          onClick={() => setHeadingOpen(!headingOpen)}
          className="inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          title="标题"
        >
          H
        </button>
        {headingOpen && (
          <div className="absolute top-full left-0 z-20 mt-1 w-32 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] py-1 shadow-lg">
            <button type="button" onClick={() => { onFormat('heading1'); setHeadingOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]">
              <span className="text-base font-bold">H1</span> 标题 1
            </button>
            <button type="button" onClick={() => { onFormat('heading2'); setHeadingOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]">
              <span className="text-base font-semibold">H2</span> 标题 2
            </button>
            <button type="button" onClick={() => { onFormat('heading3'); setHeadingOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]">
              <span className="text-base font-medium">H3</span> 标题 3
            </button>
          </div>
        )}
      </div>

      <ToolbarSeparator />

      <Btn icon={Link} onClick={() => onFormat('link')} title="插入链接 (Ctrl+K)" />
      <Btn icon={Image} onClick={() => onFormat('image')} title="插入图片" />
      <Btn icon={Table} onClick={() => onFormat('table')} title="插入表格" />

      <ToolbarSeparator />

      <Btn icon={ListOrdered} onClick={() => onFormat('ordered-list')} title="有序列表" />
      <Btn icon={List} onClick={() => onFormat('unordered-list')} title="无序列表" />
      <Btn icon={CheckSquare} onClick={() => onFormat('task-list')} title="任务列表" />

      <ToolbarSeparator />

      <Btn icon={Code} onClick={() => onFormat('code-block')} title="代码块" />


    </div>
  );
}

function Btn({ icon: Icon, onClick, title }: { icon: React.ComponentType<{ className?: string }>; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded px-1.5 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
      title={title}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
