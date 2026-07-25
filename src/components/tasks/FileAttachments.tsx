import { Download, FileIcon, Image, FileSpreadsheet, FileText, FileArchive, FileType, Trash2 } from 'lucide-react';
import type { FileRef } from '@/types';
import { formatFileSize, getFileMimeIcon } from '@/utils/file';

const FILE_ICONS: Record<string, typeof FileIcon> = {
  image: Image,
  pdf: FileType,
  spreadsheet: FileSpreadsheet,
  document: FileText,
  presentation: FileIcon,
  text: FileText,
  archive: FileArchive,
  file: FileIcon,
};

function FileIconDisplay({ mime }: { mime: string }) {
  const iconType = getFileMimeIcon(mime);
  const Icon = FILE_ICONS[iconType] ?? FileIcon;
  return <Icon className="h-4 w-4 shrink-0" />;
}

export function FileListDisplay({
  files,
  onDownload,
  onDelete,
  compact,
}: {
  files: FileRef[];
  onDownload: (file: FileRef) => void;
  onDelete?: (file: FileRef) => void;
  compact?: boolean;
}) {
  if (!files.length) return null;

  return (
    <div className={compact ? 'flex flex-wrap items-center gap-1.5' : 'mt-2 flex flex-wrap items-center gap-2'}>
      {files.map((file, i) => (
        <div
          key={i}
          className={[
            'inline-flex items-center gap-1.5 rounded-md',
            compact
              ? 'bg-[var(--color-surface-hover)] px-1.5 py-0.5 text-[10px]'
              : 'bg-[var(--color-surface-hover)] px-2 py-1 text-xs',
          ].join(' ')}
        >
          <button
            type="button"
            onClick={() => onDownload(file)}
            title={`下载 ${file.name}`}
            className="inline-flex min-w-0 max-w-[160px] items-center gap-1 text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
          >
            <FileIconDisplay mime={file.mime} />
            <span className="truncate">{file.name}</span>
            <Download className="h-3 w-3 shrink-0" />
          </button>
          {!compact && (
            <span className="text-[var(--color-text-muted)]">{formatFileSize(file.size)}</span>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(file)}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
              aria-label={`删除 ${file.name}`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
