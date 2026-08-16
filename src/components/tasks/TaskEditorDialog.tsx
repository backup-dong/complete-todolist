import * as Dialog from '@radix-ui/react-dialog';
import { useMemo } from 'react';
import type { Task } from '@/types';
import { useListsStore } from '@/stores/listsStore';
import { buildSubtaskTree } from '@/utils/subtasks';
import { TaskEditor } from './TaskEditor';

interface TaskEditorDialogProps {
  task: Task | null;
  groups: string[];
  onSave: (updated: Task) => void;
  onClose: () => void;
}

export function TaskEditorDialog({ task, groups, onSave, onClose }: TaskEditorDialogProps) {
  const open = task !== null;
  const fileCache = useListsStore((s) => s.fileCache);
  const activeListName = useListsStore((s) => s.activeListName);

  // 列表状态里任务以扁平数组保存（子任务无内存 subtasks 字段）；
  // 打开编辑器时按 parentId 重建子任务树，保证 draft 与持久化数据一致。
  const taskWithTree = useMemo(() => {
    if (!task) return null;
    if (task.subtasks && task.subtasks.length > 0) return task;
    const listName = task.sourceList ?? activeListName;
    const list = listName ? fileCache[listName] : null;
    if (!list) return task;
    return { ...task, subtasks: buildSubtaskTree(list.groups.flatMap((g) => g.tasks), task.id) };
  }, [task, fileCache, activeListName]);

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => {
      if (!isOpen) onClose();
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--color-backdrop)] backdrop-blur-sm" />
        <div className="fixed inset-0 z-50 flex pointer-events-none md:items-center md:justify-center md:p-4">
          <Dialog.Content
            className="pointer-events-auto z-50 flex h-full w-full flex-col overflow-hidden bg-[var(--color-surface-raised)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] outline-none md:h-[90vh] md:max-w-4xl md:rounded-xl md:border md:border-[var(--color-border)] md:shadow-lg md:pt-0 md:pb-0"
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">任务详情</Dialog.Title>
            {taskWithTree && (
              <TaskEditor
                key={taskWithTree.id}
                task={taskWithTree}
                groups={groups}
                onSave={onSave}
                onClose={onClose}
              />
            )}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
