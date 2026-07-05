import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastState {
  toasts: ToastItem[];
  show: (message: string, options?: { type?: ToastType; duration?: number }) => string;
  dismiss: (id: string) => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, options = {}) => {
    const id = generateId();
    const type = options.type ?? 'info';
    const duration = options.duration ?? 2500;

    set((state) => ({
      toasts: [...state.toasts, { id, message, type, duration }],
    }));

    setTimeout(() => {
      get().dismiss(id);
    }, duration);

    return id;
  },
  dismiss: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

export function showToast(
  message: string,
  options?: { type?: ToastType; duration?: number },
): string {
  return useToastStore.getState().show(message, options);
}
