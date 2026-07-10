import { useMemo, useState } from 'react';
import { CheckCircle2, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '@/types';
import { TaskCard } from './TaskCard';

function SortableTaskCard({
  task,
  sortMode,
  selected,
  selectable,
  onToggle,
  onSelect,
  onDelete,
  onComplete,
  onToggleSelect,
}: {
  task: Task;
  sortMode: 'drag' | 'due' | 'priority';
  selected?: boolean;
  selectable?: boolean;
  onToggle: (path: number[]) => void;
  onSelect: () => void;
  onDelete: () => void;
  onComplete?: () => void;
  onToggleSelect?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: sortMode !== 'drag',
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    scale: isDragging ? '0.98' : '1',
    zIndex: isDragging ? 10 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} className="relative">
      {sortMode === 'drag' && !selectable && (
        <button
          type="button"
          className="absolute -left-7 top-3 flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)] cursor-grab active:cursor-grabbing"
          onClick={(e) => e.stopPropagation()}
          {...attributes}
          {...listeners}
          aria-label="拖拽排序"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <TaskCard
        task={task}
        selected={selected}
        selectable={selectable}
        onToggleSelect={onToggleSelect}
        onToggle={onToggle}
        onStartEdit={onSelect}
        onDelete={onDelete}
        onComplete={onComplete}
      />
    </div>
  );
}

function GroupSection({
  name,
  tasks,
  sortMode,
  selectedIds,
  selectable,
  onToggle,
  onSelect,
  onDelete,
  onComplete,
  onToggleSelect,
}: {
  name: string;
  tasks: Task[];
  sortMode: 'drag' | 'due' | 'priority';
  selectedIds: Set<string>;
  selectable?: boolean;
  onToggle: (taskId: string, path: number[]) => void;
  onSelect: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onComplete?: (taskId: string) => void;
  onToggleSelect?: (taskId: string) => void;
}) {
  const done = tasks.filter((t) => t.meta.status === 'done').length;
  const total = tasks.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="mb-6 last:mb-0">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2">
        <h3 className="text-sm font-semibold text-[var(--color-text-secondary)]">{name}</h3>
        <div className="flex items-center gap-2">
          <div className="h-2 w-20 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-inset)]">
            <div
              className={`h-full rounded-full ${pct === 100 ? 'bg-[var(--color-success)]' : 'bg-[var(--color-primary)]'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs tabular-nums text-[var(--color-text-muted)]">
            {done}/{total}
          </span>
        </div>
      </div>

      <div className="px-4 pb-4 pt-4">
        {tasks.length === 0 ? (
          <p className="py-2 text-xs text-[var(--color-text-muted)]">该分组下还没有任务</p>
        ) : (
          <div className="space-y-3 pl-7">
            {tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                sortMode={sortMode}
                selected={selectedIds.has(task.id)}
                selectable={selectable}
                onToggle={(path) => onToggle(task.id, path)}
                onSelect={() => onSelect(task.id)}
                onDelete={() => onDelete(task.id)}
                onComplete={() => onComplete?.(task.id)}
                onToggleSelect={() => onToggleSelect?.(task.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TaskList({
  tasks,
  sortMode,
  groupBy = false,
  selectable = false,
  selectedIds = new Set(),
  onReorder,
  onReorderInGroup,
  onToggle,
  onSelect,
  onDelete,
  onComplete,
  onToggleSelect,
}: {
  tasks: Task[];
  sortMode: 'drag' | 'due' | 'priority';
  groupBy?: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onReorder: (from: number, to: number) => void;
  onReorderInGroup?: (groupName: string, from: number, to: number) => void;
  onToggle: (taskId: string, path: number[]) => void;
  onSelect: (taskId: string) => void;
  onDelete: (taskId: string) => void;
  onComplete?: (taskId: string) => void;
  onToggleSelect?: (taskId: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeTask = useMemo(() => tasks.find((t) => t.id === activeId), [tasks, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const map = new Map<string, Task[]>();
    for (const task of tasks) {
      const list = map.get(task.group) ?? [];
      list.push(task);
      map.set(task.group, list);
    }
    return Array.from(map.entries()).map(([name, items]) => ({ name, tasks: items }));
  }, [tasks, groupBy]);

  const taskIdToGroup = useMemo(() => {
    const map = new Map<string, string>();
    for (const task of tasks) {
      map.set(task.id, task.group);
    }
    return map;
  }, [tasks]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleFlatDragEnd = (activeId: string, overId: string) => {
    const oldIndex = tasks.findIndex((t) => t.id === activeId);
    const newIndex = tasks.findIndex((t) => t.id === overId);
    onReorder(oldIndex, newIndex);
  };

  const handleGroupDragEnd = (activeId: string, overId: string) => {
    if (!grouped || !onReorderInGroup) return;

    const groupName = taskIdToGroup.get(activeId);
    const overGroup = taskIdToGroup.get(overId);
    if (!groupName || groupName !== overGroup) return;

    const groupTasks = grouped.find((g) => g.name === groupName)?.tasks ?? [];
    const oldIndex = groupTasks.findIndex((t) => t.id === activeId);
    const newIndex = groupTasks.findIndex((t) => t.id === overId);
    if (oldIndex >= 0 && newIndex >= 0) {
      onReorderInGroup(groupName, oldIndex, newIndex);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;

    if (groupBy) {
      handleGroupDragEnd(active.id as string, over.id as string);
    } else {
      handleFlatDragEnd(active.id as string, over.id as string);
    }
  };

  if (tasks.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4 text-[var(--color-text-muted)]">
        <CheckCircle2 className="mb-4 h-12 w-12" strokeWidth={1.5} />
        <p className="text-base font-medium text-[var(--color-text-secondary)]">当前清单还没有任务</p>
        <p className="text-sm">点击下方「+ 新建任务」开始</p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {groupBy && grouped ? (
        <div>
          {grouped.map((group) => (
            <SortableContext
              key={group.name}
              items={group.tasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <GroupSection
                name={group.name}
                tasks={group.tasks}
                sortMode={sortMode}
                selectedIds={selectedIds}
                selectable={selectable}
                onToggle={onToggle}
                onSelect={onSelect}
                onDelete={onDelete}
                onComplete={onComplete}
                onToggleSelect={onToggleSelect}
              />
            </SortableContext>
          ))}
        </div>
      ) : (
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3 p-4 pl-11">
            {tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                sortMode={sortMode}
                selected={selectedIds.has(task.id)}
                selectable={selectable}
                onToggle={(path) => onToggle(task.id, path)}
                onSelect={() => onSelect(task.id)}
                onDelete={() => onDelete(task.id)}
                onComplete={() => onComplete?.(task.id)}
                onToggleSelect={() => onToggleSelect?.(task.id)}
              />
            ))}
          </div>
        </SortableContext>
      )}

      <DragOverlay dropAnimation={null}>
        {activeTask ? (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-lg opacity-90 rotate-1">
            <TaskCard
              task={activeTask}
              onToggle={() => {}}
              onStartEdit={() => {}}
              onDelete={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
