#!/usr/bin/env node
// v1 → v2 本地迁移工具：直接操作本地拉取下来的待办仓库目录。
// 用法：
//   npm run migrate:v2 -- --dir <本地待办仓库目录> [--backup-dir <备份输出目录>] [--dry-run] [--no-backup]
//
// 行为：
//   - 递归扫描目录下所有 *.json（跳过 .git / node_modules / 备份输出目录）
//   - version === 2 跳过（幂等）；version === 1 转换并写回；其他版本/解析失败告警跳过
//   - 默认先把所有 v1 文件备份为一个 zip 压缩包（dong-todo-v1-backup-<时间戳>.zip），
//     输出到仓库目录的上一级（可用 --backup-dir 指定）；--no-backup 关闭
//   - --dry-run 只报告不写回、不备份

import fs from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { ZipArchive } from 'archiver';
import { migrateJsonV1toV2 } from './transform.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir' || arg === '--backup-dir') {
      args[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--no-backup') {
      args.noBackup = true;
    } else if (arg === '--help') {
      args.help = true;
    }
  }
  return args;
}

function walkJsonFiles(dir, skipNames, skipPaths, result) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skipNames.includes(entry.name) || skipPaths.has(full)) continue;
      walkJsonFiles(full, skipNames, skipPaths, result);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      result.push(full);
    }
  }
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function createBackupZip(files, zipPath) {
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  const output = createWriteStream(zipPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.pipe(output);
  for (const file of files) {
    archive.append(fs.createReadStream(file.absolute), { name: file.relative });
  }
  await archive.finalize();
  await new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
  });
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`用法:
  npm run migrate:v2 -- --dir <本地待办仓库目录> [--backup-dir <备份输出目录>] [--dry-run] [--no-backup]

参数:
  --dir           本地拉取下来的待办仓库根目录（必填）
  --backup-dir    备份 zip 的输出目录，默认是 --dir 的上一级
  --dry-run       只报告，不写回、不备份
  --no-backup     不生成备份压缩包
`);
  process.exit(0);
}

if (!args.dir) {
  console.error('缺少必填参数 --dir（--help 查看用法）');
  process.exit(1);
}

const repoDir = path.resolve(args.dir);
if (!fs.existsSync(repoDir) || !fs.statSync(repoDir).isDirectory()) {
  console.error(`目录不存在或不是文件夹: ${repoDir}`);
  process.exit(1);
}

const backupDir = path.resolve(args.backupDir ?? path.dirname(repoDir));
const backupDirResolved = path.resolve(backupDir);

const jsonFiles = [];
walkJsonFiles(repoDir, ['.git', 'node_modules'], new Set([backupDirResolved]), jsonFiles);

console.log(`扫描 ${repoDir} 下的 *.json ...（共 ${jsonFiles.length} 个文件）`);

const v1Files = [];
const skipped = [];
const failed = [];

for (const file of jsonFiles) {
  const relative = path.relative(repoDir, file).replace(/\\/g, '/');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const version = raw && typeof raw === 'object' ? raw.version : undefined;
    if (version === 2) {
      skipped.push(relative);
    } else if (version === 1) {
      v1Files.push({ absolute: file, relative });
    } else {
      failed.push({ relative, reason: `不支持的版本 ${version ?? '未知'}` });
    }
  } catch (err) {
    failed.push({ relative, reason: `解析失败: ${err.message}` });
  }
}

console.log(`待迁移(v1): ${v1Files.length}  跳过(v2): ${skipped.length}  失败: ${failed.length}`);

for (const f of failed) {
  console.warn(`  [失败] ${f.relative}: ${f.reason}`);
}

let zipPath = null;
if (!args.dryRun && !args.noBackup && v1Files.length > 0) {
  zipPath = path.join(backupDir, `dong-todo-v1-backup-${timestamp()}.zip`);
  try {
    await createBackupZip(v1Files, zipPath);
    console.log(`备份完成: ${zipPath}`);
  } catch (err) {
    console.warn(`备份失败（继续迁移）: ${err.message}`);
    zipPath = null;
  }
}

const migrated = [];
for (const file of v1Files) {
  try {
    const content = fs.readFileSync(file.absolute, 'utf8');
    const output = migrateJsonV1toV2(content);
    if (!args.dryRun) {
      fs.writeFileSync(file.absolute, output, 'utf8');
    }
    migrated.push(file.relative);
    console.log(`  [迁移${args.dryRun ? '/dry-run' : ''}] ${file.relative}`);
  } catch (err) {
    failed.push({ relative: file.relative, reason: err.message });
    console.warn(`  [失败] ${file.relative}: ${err.message}`);
  }
}

console.log('');
console.log('==== 迁移报告 ====');
console.log(`  迁移: ${migrated.length}`);
console.log(`  跳过(v2): ${skipped.length}`);
console.log(`  失败: ${failed.length}`);
if (zipPath) {
  console.log(`  备份: ${zipPath}`);
} else if (args.dryRun) {
  console.log('  备份: （dry-run 不生成）');
} else if (args.noBackup) {
  console.log('  备份: 已禁用（--no-backup）');
}

if (failed.length > 0) {
  console.log('失败列表:');
  for (const f of failed) {
    if (!migrated.includes(f.relative)) {
      console.log(`  - ${f.relative}: ${f.reason}`);
    }
  }
  process.exitCode = 1;
}