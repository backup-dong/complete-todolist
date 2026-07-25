import { useCallback } from 'react';
import type { FileRef } from '@/types';
import { useSyncStore } from '@/stores/syncStore';
import { downloadFileRef } from './fileDownload';

export function useFileDownload() {
  const config = useSyncStore((s) => s.config);

  const download = useCallback(
    async (file: FileRef) => {
      if (!config) return;
      try {
        await downloadFileRef(config, file);
      } catch (err) {
        console.error('Download failed:', err);
      }
    },
    [config],
  );

  return download;
}
