import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Download, X, AlertCircle, ZoomIn, ZoomOut, RotateCcw, RotateCw, Maximize2, Minimize2 } from 'lucide-react';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import type { FileRef } from '@/types';
import { useSyncStore } from '@/stores/syncStore';
import { MarkdownPreview } from '@/components/common/MarkdownPreview';
import {
  fetchFilePreviewDataUrl,
  getPreviewKind,
  type PreviewKind,
} from '@/utils/filePreview';
import { formatFileSize } from '@/utils/file';

function decodeBase64Text(dataUrl: string): string {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const TOOLBAR_BUTTON =
  'rounded p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white';

function PreviewBody({
  kind,
  dataUrl,
  onDownload,
}: {
  kind: PreviewKind;
  dataUrl: string;
  onDownload?: () => void;
}) {
  if (kind === 'image') {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        <PhotoProvider
          toolbarRender={({ rotate, onRotate, scale, onScale }) => (
            <>
              <button
                type="button"
                title="缩小"
                className={TOOLBAR_BUTTON}
                onClick={() => onScale(Math.max(0.25, scale - 0.5))}
              >
                <ZoomOut className="h-5 w-5" />
              </button>
              <button
                type="button"
                title="放大"
                className={TOOLBAR_BUTTON}
                onClick={() => onScale(Math.min(8, scale + 0.5))}
              >
                <ZoomIn className="h-5 w-5" />
              </button>
              <button
                type="button"
                title="左旋"
                className={TOOLBAR_BUTTON}
                onClick={() => onRotate(rotate - 90)}
              >
                <RotateCcw className="h-5 w-5" />
              </button>
              <button
                type="button"
                title="右旋"
                className={TOOLBAR_BUTTON}
                onClick={() => onRotate(rotate + 90)}
              >
                <RotateCw className="h-5 w-5" />
              </button>
              {onDownload && (
                <button type="button" title="下载" className={TOOLBAR_BUTTON} onClick={onDownload}>
                  <Download className="h-5 w-5" />
                </button>
              )}
            </>
          )}
        >
          <PhotoView src={dataUrl}>
            <img
              src={dataUrl}
              alt=""
              title="点击全屏查看"
              className="max-h-full max-w-full cursor-zoom-in object-contain"
            />
          </PhotoView>
        </PhotoProvider>
      </div>
    );
  }
  if (kind === 'pdf') {
    return <iframe src={dataUrl} title="PDF 预览" className="min-h-0 flex-1 border-none bg-white" />;
  }
  const text = decodeBase64Text(dataUrl);
  if (kind === 'markdown') {
    return (
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <MarkdownPreview content={text} className="mx-auto max-w-3xl" />
      </div>
    );
  }
  return (
    <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
      {text}
    </pre>
  );
}

function FilePreviewLoader({
  file,
  onDownload,
}: {
  file: FileRef;
  onDownload?: () => void;
}) {
  const config = useSyncStore((s) => s.config);
  const [kind] = useState<PreviewKind | null>(() => getPreviewKind(file.mime, file.name));
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!kind || !config) return;
    let cancelled = false;
    fetchFilePreviewDataUrl(config, file)
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((err) => {
        console.error('Preview failed:', err);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [file, config, kind]);

  if (!kind) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[var(--color-text-muted)]">
        <AlertCircle className="h-6 w-6" />
        <span className="text-xs">该文件类型暂不支持在线预览，请下载后查看</span>
      </div>
    );
  }
  if (!dataUrl && !error) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-[var(--color-text-muted)]">
        加载中...
      </div>
    );
  }
  if (error || !dataUrl) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[var(--color-text-muted)]">
        <AlertCircle className="h-6 w-6" />
        <span className="text-xs">预览加载失败，请检查网络后重试</span>
      </div>
    );
  }
  return <PreviewBody kind={kind} dataUrl={dataUrl} onDownload={onDownload} />;
}

export function FilePreviewDialog({ file, onClose }: { file: FileRef | null; onClose: () => void }) {
  const config = useSyncStore((s) => s.config);
  const [fullscreen, setFullscreen] = useState(false);

  const download = async () => {
    if (!file || !config) return;
    try {
      const url = await fetchFilePreviewDataUrl(config, file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  return (
    <Dialog.Root open={file !== null} onOpenChange={(open) => {
      if (open) return;
      setFullscreen(false);
      onClose();
    }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 bg-[var(--color-backdrop)] backdrop-blur-sm"
          onClick={(e) => {
            // 遮罩属于弹窗自身，点击不应沿 React 树继续冒泡到下层待办卡片等组件；
            // 同时手动关闭弹窗（Radix 的 deferred dismissal 会因事件被阻止而跳过）。
            e.stopPropagation();
            onClose();
          }}
        />
        <div
          className={[
            'fixed inset-0 z-50 flex pointer-events-none',
            fullscreen ? '' : 'md:items-center md:justify-center md:p-6',
          ].join(' ')}
        >
          <Dialog.Content
            className={[
              'pointer-events-auto z-50 flex h-full w-full flex-col overflow-hidden bg-[var(--color-surface-raised)] outline-none',
              fullscreen
                ? 'md:h-full md:max-w-none md:rounded-none md:border-0 md:shadow-none'
                : 'md:h-[85vh] md:max-w-3xl md:rounded-xl md:border md:border-[var(--color-border)] md:shadow-lg',
            ].join(' ')}
          >
            <Dialog.Title className="sr-only">附件预览</Dialog.Title>
            {file && (
              <>
                <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border-subtle)] px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>
                  <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                    {formatFileSize(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFullscreen((v) => !v)}
                    title={fullscreen ? '退出全屏' : '全屏'}
                    className="shrink-0 rounded p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                  >
                    {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={download}
                    title={`下载 ${file.name}`}
                    className="shrink-0 rounded p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-primary)]"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      title="关闭"
                      className="shrink-0 rounded p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </div>
                <div className="flex min-h-0 flex-1 flex-col">
                  <FilePreviewLoader key={`${file.sha}-${file.name}`} file={file} onDownload={download} />
                </div>
              </>
            )}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
