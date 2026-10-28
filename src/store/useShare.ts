import { create } from 'zustand';
import type { ShareScope } from '../utils/sync';

type ShareSheetState = {
  visible: boolean;
  /** Which link the sheet opened on. The user can still change it in the sheet. */
  scope: ShareScope;
  open: (scope: ShareScope) => void;
  close: () => void;
  setScope: (scope: ShareScope) => void;
};

/**
 * Only decides whether the share sheet is on screen, and which link it starts
 * on. The upload itself lives in `ShareSheet`, which is mounted for the whole
 * life of the app, so closing the sheet never cancels a transfer.
 *
 * Separate from the main store because none of this may persist: a link that
 * is half sent must not come back after a restart.
 */
export const useShareSheet = create<ShareSheetState>(set => ({
  visible: false,
  scope: 'full',
  open: scope => set({ visible: true, scope }),
  close: () => set({ visible: false }),
  setScope: scope => set({ scope }),
}));

/** Opens the share sheet from anywhere. */
export const openShareSheet = (scope: ShareScope) => useShareSheet.getState().open(scope);
