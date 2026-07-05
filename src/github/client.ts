import { Octokit } from 'octokit';
import type { GithubConfig } from '@/types';

export interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  content: string;
}

let octokit: Octokit | null = null;

export function initGitHub(config: GithubConfig): void {
  octokit = new Octokit({ auth: config.token });
}

export function clearGitHub(): void {
  octokit = null;
}

export function getOctokit(): Octokit {
  if (!octokit) throw new Error('GitHub client not initialized');
  return octokit;
}

export async function listMarkdownFiles(config: GithubConfig): Promise<Pick<GitHubFile, 'name' | 'path' | 'sha'>[]> {
  const { data } = await getOctokit().rest.repos.getContent({
    owner: config.owner,
    repo: config.repo,
    path: config.basePath,
  });

  if (!Array.isArray(data)) return [];

  return data
    .filter((item) => item.type === 'file' && item.name.endsWith('.md'))
    .map((item) => ({ name: item.name, path: item.path!, sha: item.sha! }));
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  return btoa(binString);
}

function base64ToUtf8(str: string): string {
  const binString = atob(str);
  const bytes = Uint8Array.from(binString, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export async function getFileContent(config: GithubConfig, path: string): Promise<GitHubFile> {
  const { data } = await getOctokit().rest.repos.getContent({
    owner: config.owner,
    repo: config.repo,
    path,
  });

  if (Array.isArray(data) || !('content' in data)) {
    throw new Error(`Path ${path} is not a file`);
  }

  return {
    name: data.name!,
    path: data.path!,
    sha: data.sha!,
    content: base64ToUtf8(data.content!.replace(/\n/g, '')),
  };
}

export async function writeFileContent(
  config: GithubConfig,
  path: string,
  content: string,
  sha?: string,
): Promise<string> {
  const encoded = utf8ToBase64(content);
  const { data } = await getOctokit().rest.repos.createOrUpdateFileContents({
    owner: config.owner,
    repo: config.repo,
    path,
    message: `update ${path}`,
    content: encoded,
    sha,
  });

  return data.content?.sha ?? '';
}

export async function deleteFile(config: GithubConfig, path: string, sha: string): Promise<void> {
  await getOctokit().rest.repos.deleteFile({
    owner: config.owner,
    repo: config.repo,
    path,
    message: `delete ${path}`,
    sha,
  });
}
