import type { FileRef, GithubConfig } from '@/types';
import { fileExists, uploadBinaryFile } from '@/github/client';
import { computeFileHash, fileToBase64, getFileExtension } from './file';

export async function uploadFileToRepo(
  config: GithubConfig,
  file: File,
  listName: string,
  taskId: string,
): Promise<FileRef> {
  const hash = await computeFileHash(file);
  const ext = getFileExtension(file.name);
  const fileName = ext ? `${hash}.${ext}` : hash;
  const storageDir = `${config.basePath}/attachments/${listName}/${taskId}`;
  const storagePath = `${storageDir}/${fileName}`;

  const existing = await fileExists(config, storagePath);
  let sha: string;
  if (existing.exists && existing.sha) {
    sha = existing.sha;
  } else {
    const base64 = await fileToBase64(file);
    sha = await uploadBinaryFile(config, storagePath, base64);
  }

  return {
    name: file.name,
    path: storagePath,
    sha,
    size: file.size,
    mime: file.type || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
  };
}
