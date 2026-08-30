import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { format } from 'date-fns';
import { CalendarDrawer } from './CalendarDrawer';
import type { Task } from '@/types';

function makeTask(over: Partial<Task> & { id: string; title: string }): Task {
  return {
    group: '默认',
    meta: { status: 'active', priority: 'med', due: '2026-08-15' },
    completed_at: null,
    duration: null,
    ...over,
  } as Task;
}

describe('CalendarDrawer', () => {
  it('renders current month header and a task under its due day', () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const due = format(now, 'yyyy-MM-dd');
    const task = makeTask({ id: 't1', title: '今天交报告', meta: { status: 'active', priority: 'high', due, created: '2026-08-01' } });
    const html = renderToStaticMarkup(
      <CalendarDrawer onClose={() => {}} tasks={[task]} onSelect={() => {}} />,
    );
    expect(html).toContain(`${now.getFullYear()}年${month}月`);
    expect(html).toContain('今天交报告');
  });

  it('shows a muted empty hint for a day without tasks', () => {
    const noTaskList: Task[] = [];
    const html = renderToStaticMarkup(
      <CalendarDrawer onClose={() => {}} tasks={noTaskList} onSelect={() => {}} />,
    );
    expect(html).toContain('当天无待办');
  });
});
