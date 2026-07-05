import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore, type Theme } from '@/stores/themeStore';

const labels: Record<Theme, string> = {
  light: '浅色模式',
  dark: '深色模式',
  system: '跟随系统',
};

const icons: Record<Theme, React.ReactNode> = {
  light: <Sun className="h-4 w-4" />,
  dark: <Moon className="h-4 w-4" />,
  system: <Monitor className="h-4 w-4" />,
};

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, cycleTheme } = useThemeStore();

  return (
    <button
      type="button"
      onClick={cycleTheme}
      title={labels[theme]}
      aria-label={labels[theme]}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md px-2.5 py-1.5 text-sm',
        'text-[var(--color-text-secondary)]',
        'hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]',
        'focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]',
        'transition-colors duration-120',
        className,
      ].join(' ')}
    >
      {icons[theme]}
      <span className="text-xs">{labels[theme]}</span>
    </button>
  );
}
