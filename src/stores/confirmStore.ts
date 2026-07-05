import { create } from 'zustand';

interface ConfirmState {
  open: boolean;
  message: string;
  resolve: ((value: boolean) => void) | null;
  confirm: (message: string) => Promise<boolean>;
  close: (result: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  message: '',
  resolve: null,
  confirm: (message) => {
    return new Promise((resolve) => {
      set({ open: true, message, resolve });
    });
  },
  close: (result) => {
    const { resolve } = get();
    resolve?.(result);
    set({ open: false, message: '', resolve: null });
  },
}));

export function confirm(message: string): Promise<boolean> {
  return useConfirmStore.getState().confirm(message);
}
