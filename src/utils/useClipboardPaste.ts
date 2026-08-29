import { useCallback, useEffect, useRef } from 'react';

interface PasteTarget {
  id: symbol;
  timer: ReturnType<typeof setTimeout>;
}

// 模块级共享目标：同一时刻只允许一个组件处于「粘贴模式」，
// 避免连续点击多个「粘贴」按钮后一次 Ctrl+V 被多个组件重复消费。
let armedTarget: PasteTarget | null = null;

const ARM_TIMEOUT_MS = 10000;

function clearArmedTarget() {
  if (armedTarget) {
    clearTimeout(armedTarget.timer);
    armedTarget = null;
  }
}

/**
 * 按钮控制的剪贴板文件上传。
 *
 * 从系统文件管理器复制的文件无法通过 `navigator.clipboard.read()` 读取，
 * 只能由用户按 Ctrl+V 触发的 paste 事件提供 `clipboardData.files`。
 * 为避免误触上传，默认不监听任何粘贴；调用返回的 `arm()` 开启一次性
 * 「粘贴模式」，此后下一次含文件的 Ctrl+V 才会被消费并交给 `onFiles`，
 * 随后自动解除（10 秒内未粘贴也会自动解除）。
 */
export function useClipboardPaste(onFiles: (files: File[]) => void, enabled = true) {
  const onFilesRef = useRef(onFiles);

  useEffect(() => {
    onFilesRef.current = onFiles;
  }, [onFiles]);

  const idRef = useRef<symbol | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const handlePaste = (e: ClipboardEvent) => {
      const target = armedTarget;
      if (!target || !idRef.current || target.id !== idRef.current) return;
      const data = e.clipboardData;
      if (!data || data.files.length === 0) return;
      e.preventDefault();
      clearArmedTarget();
      idRef.current = null;
      onFilesRef.current(Array.from(data.files));
    };

    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('paste', handlePaste);
      if (armedTarget && idRef.current && armedTarget.id === idRef.current) {
        clearArmedTarget();
      }
    };
  }, [enabled]);

  const arm = useCallback(() => {
    clearArmedTarget();
    const id = Symbol('paste-target');
    idRef.current = id;
    const timer = setTimeout(() => {
      if (armedTarget && armedTarget.id === id) armedTarget = null;
    }, ARM_TIMEOUT_MS);
    armedTarget = { id, timer };
  }, []);

  return { arm };
}
