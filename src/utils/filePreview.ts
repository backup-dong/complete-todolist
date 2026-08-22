import type { FileRef, GithubConfig } from '@/types';
import { getBinaryFileContent } from '@/github/client';

export type PreviewKind = 'image' | 'pdf' | 'text' | 'markdown';

const TEXT_EXTENSIONS = new Set([
  'txt', 'log', 'json', 'csv', 'tsv', 'xml', 'yml', 'yaml', 'toml', 'ini',
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'css', 'scss', 'less', 'html',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs',
  'sh', 'bat', 'ps1', 'sql', 'env', 'gitignore', 'mdx',
]);

export function getPreviewKind(mime: string, name: string): PreviewKind | null {
  const lowerName = name.toLowerCase();
  if (mime.startsWith('image/')) return mime === 'image/svg+xml' ? null : 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) return 'markdown';
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml') {
    return 'text';
  }
  const i = lowerName.lastIndexOf('.');
  const ext = i > 0 ? lowerName.slice(i + 1) : '';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  return null;
}

const dataUrlCache = new Map<string, string>();

export function clearPreviewCache(): void {
  dataUrlCache.clear();
}

export async function fetchFilePreviewDataUrl(
  config: GithubConfig,
  fileRef: FileRef,
): Promise<string> {
  const cached = dataUrlCache.get(fileRef.sha);
  if (cached) return cached;

  const { base64 } = await getBinaryFileContent(config, fileRef.path);
  const dataUrl = `data:${fileRef.mime};base64,${base64}`;
  dataUrlCache.set(fileRef.sha, dataUrl);
  return dataUrl;
}
