import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Save, Trash2, Palette } from 'lucide-react';
import { useSyncStore } from '@/stores/syncStore';
import { ThemeToggle } from '@/components/common/ThemeToggle';

export function Settings() {
  const { config, configure, clear } = useSyncStore();
  const navigate = useNavigate();
  const [token, setToken] = useState(config?.token ?? '');
  const [owner, setOwner] = useState(config?.owner ?? '');
  const [repo, setRepo] = useState(config?.repo ?? '');
  const [basePath, setBasePath] = useState(config?.basePath ?? 'todo');

  const handleSave = () => {
    configure(token.trim(), owner.trim(), repo.trim(), basePath.trim() || 'todo');
    navigate('/');
  };

  return (
    <div className="flex h-svh">
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary-subtle)] text-[var(--color-primary)]">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-[var(--color-text)]">配置 GitHub 同步</h1>
                <p className="text-sm text-[var(--color-text-muted)]">数据存储在你的私有仓库中</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn-ghost p-1.5"
              aria-label="返回"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">GitHub Token</span>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxx"
                className="input"
              />
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                创建 Fine-grained PAT，权限选择 Contents: Read and write
              </p>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">仓库所有者</span>
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="your-github-username"
                className="input"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">仓库名</span>
              <input
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="todo-data"
                className="input"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[var(--color-text-secondary)]">存储路径</span>
              <input
                type="text"
                value={basePath}
                onChange={(e) => setBasePath(e.target.value)}
                placeholder="todo"
                className="input"
              />
            </label>
          </div>

          <div className="mt-6 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)]">
              <Palette className="h-4 w-4" />
              <span>外观</span>
            </div>
            <ThemeToggle className="w-full justify-between" />
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              className="btn-primary flex-1"
            >
              <Save className="mr-1.5 h-4 w-4" />
              保存并同步
            </button>
            {config && (
              <button
                type="button"
                onClick={clear}
                className="btn-secondary"
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                清除配置
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
