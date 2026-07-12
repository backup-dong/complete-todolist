import { useEffect } from 'react';
import { useThemeStore, subscribeToSystemTheme } from '@/stores/themeStore';

function applyThemeClass(theme: 'light' | 'dark') {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  updateThemeColor(theme);
}

function updateThemeColor(theme: 'light' | 'dark') {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#020617' : '#F8FAFC');
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useThemeStore();

  useEffect(() => {
    applyThemeClass(useThemeStore.getState().effectiveTheme);

    const unsubscribe = subscribeToSystemTheme((systemTheme) => {
      const state = useThemeStore.getState();
      if (state.theme === 'system') {
        useThemeStore.setState({ effectiveTheme: systemTheme });
        applyThemeClass(systemTheme);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    applyThemeClass(useThemeStore.getState().effectiveTheme);
  }, [theme]);

  return <>{children}</>;
}
