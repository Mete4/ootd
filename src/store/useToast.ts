import { create } from 'zustand';

export type ToastAction = { label: string; onPress: () => void };

type ToastState = {
  message: string | null;
  action: ToastAction | null;
  /** Increments on every call, so the host can restart its timer. */
  nonce: number;
  showToast: (message: string, action?: ToastAction) => void;
  hideToast: () => void;
};

/**
 * Transient feedback.
 *
 * A modal alert on a successful action costs the user one more tap for no
 * information. A toast reports the result and can carry an Undo action.
 *
 * This store is separate from the main store because it holds a function and
 * must never persist.
 */
export const useToast = create<ToastState>((set, get) => ({
  message: null,
  action: null,
  nonce: 0,
  showToast: (message, action) =>
    set({ message, action: action ?? null, nonce: get().nonce + 1 }),
  hideToast: () => set({ message: null, action: null }),
}));

/** Shows a toast from outside a React component. */
export const showToast = (message: string, action?: ToastAction) =>
  useToast.getState().showToast(message, action);
