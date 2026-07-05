import { showToast } from '@/stores/toastStore';
import type { ToastType } from '@/stores/toastStore';

export const toast = {
  success: (message: string, duration?: number) =>
    showToast(message, { type: 'success', duration }),
  error: (message: string, duration?: number) =>
    showToast(message, { type: 'error', duration }),
  info: (message: string, duration?: number) =>
    showToast(message, { type: 'info', duration }),
  raw: (message: string, options?: { type?: ToastType; duration?: number }) =>
    showToast(message, options),
};
