import { useEffect } from 'react';
import { useListsStore } from '@/stores/listsStore';
import { isDueToday } from '@/utils/date';
import { cacheNotified, hasNotified } from '@/utils/storage';

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { fileCache } = useListsStore();

  useEffect(() => {
    if (!('Notification' in window)) return;

    Notification.requestPermission().then((permission) => {
      if (permission !== 'granted') return;

      const check = () => {
        const allTasks = Object.values(fileCache).flatMap((list) => list.groups.flatMap((g) => g.tasks));
        for (const task of allTasks) {
          if (task.meta.due && isDueToday(task.meta.due) && task.meta.status !== 'done') {
            const key = `${task.id}-${task.meta.due}`;
            if (!hasNotified(task.id, task.meta.due)) {
              new Notification('待办提醒', {
                body: `${task.title} 今天到期`,
                tag: key,
              });
              cacheNotified(task.id, task.meta.due);
            }
          }
        }
      };

      check();
      const interval = setInterval(check, 60_000);
      return () => clearInterval(interval);
    });
  }, [fileCache]);

  return <>{children}</>;
}
