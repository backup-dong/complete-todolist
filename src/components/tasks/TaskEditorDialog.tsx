import * as Dialog from '@radix-ui/react-dialog';
import type { Task } from '@/types';
import { TaskEditor } from './TaskEditor';

interface TaskEditorDialogProps {
  task: Task | null;
  groups: string[];
  onSave: (updated: Task) => void;
  onClose: () => void;
}

export function TaskEditorDialog({ task, groups, onSave, onClose }: TaskEditorDialogProps) {
  const open = task !== null;

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => {
      if (!isOpen) onClose();
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <Dialog.Content
            className="pointer-events-auto z-50 flex h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] shadow-lg outline-none"
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">任务详情</Dialog.Title>
            {task && (
              <TaskEditor
                key={task.id}
                task={task}
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
