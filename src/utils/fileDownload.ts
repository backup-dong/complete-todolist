import type { FileRef, GithubConfig } from '@/types';
import { getBinaryFileContent } from '@/github/client';

export async function downloadFileRef(config: GithubConfig, fileRef: FileRef): Promise<void> {
  const { base64 } = await getBinaryFileContent(config, fileRef.path);
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: fileRef.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileRef.name;
  a.click();
  URL.revokeObjectURL(url);
}
