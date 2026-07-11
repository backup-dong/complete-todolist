import type { Task } from '@/types';
import { TaskCard } from '@/components/tasks/TaskCard';

function GroupSection({
  name,
  tasks,
  onToggle,
  onSelect,
  onDelete,
  onComplete,
}: {
  name: string;
  tasks: Task[];
  onToggle: (taskId: string, path: number[]) => void;
  onSelect: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onComplete?: (taskId: string) => void;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2">
        <h4 className="text-sm font-semibold text-[var(--color-text-secondary)]">{name}</h4>
        <span className="text-xs tabular-nums text-[var(--color-text-muted)]">{tasks.length}</span>
      </div>
      <div className="space-y-3 px-4 pt-3">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onToggle={(path) => onToggle(task.id, path)}
            onStartEdit={() => onSelect(task.id)}
            onDelete={() => onDelete(task.id)}
            onComplete={onComplete ? () => onComplete(task.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function ListSection({
  listName,
  groups,
  onToggle,
  onSelect,
  onDelete,
  onComplete,
}: {
  listName: string;
  groups: { name: string; tasks: Task[] }[];
  onToggle: (taskId: string, path: number[]) => void;
  onSelect: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onComplete?: (taskId: string) => void;
}) {
  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] last:mb-0">
      <div className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)] px-4 py-2.5">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">{listName}</h3>
      </div>
      <div className="py-2">
        {groups.map((group) => (
          <GroupSection
            key={group.name}
            name={group.name}
            tasks={group.tasks}
            onToggle={onToggle}
            onSelect={onSelect}
            onDelete={onDelete}
            onComplete={onComplete}
          />
        ))}
      </div>
    </div>
  );
}

export function TodoView({
  tasks,
  onToggle,
  onSelect,
  onDelete,
  onComplete,
}: {
  tasks: Task[];
  onToggle: (taskId: string, path: number[]) => void;
  onSelect: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onComplete?: (taskId: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-[var(--color-text-muted)]">
        <p className="text-base font-medium text-[var(--color-text-secondary)]">当前没有符合条件的待完成</p>
        <p className="text-sm">选择一个清单开始添加任务</p>
      </div>
    );
  }

  // 按清单 -> 分组 两层分组
  const grouped = new Map<string, Map<string, Task[]>>();
  for (const task of tasks) {
    const listName = task.sourceList ?? '未命名清单';
    if (!grouped.has(listName)) {
      grouped.set(listName, new Map());
    }
    const listGroups = grouped.get(listName)!;
    if (!listGroups.has(task.group)) {
      listGroups.set(task.group, []);
    }
    listGroups.get(task.group)!.push(task);
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      {Array.from(grouped.entries()).map(([listName, listGroups]) => (
        <ListSection
          key={listName}
          listName={listName}
          groups={Array.from(listGroups.entries()).map(([name, items]) => ({ name, tasks: items }))}
          onToggle={onToggle}
          onSelect={onSelect}
          onDelete={onDelete}
          onComplete={onComplete}
        />
      ))}
    </div>
  );
}
