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
        <div className="fixed inset-0 z-50 flex pointer-events-none md:items-center md:justify-center md:p-4">
          <Dialog.Content
            className="pointer-events-auto z-50 flex h-full w-full flex-col overflow-hidden bg-[var(--color-surface-raised)] outline-none md:h-[90vh] md:max-w-4xl md:rounded-xl md:border md:border-[var(--color-border)] md:shadow-lg"
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
