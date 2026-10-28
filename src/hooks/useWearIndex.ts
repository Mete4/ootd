import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { lastWornLabelFrom } from '../utils/format';

export type WearIndex = {
  /** The stable display number of an item. */
  numberOf: (id: string) => number;
  /** Wear timestamps in milliseconds, newest first. */
  wearDates: (id: string) => number[];
  wearCount: (id: string) => number;
  lastWornLabel: (id: string) => string;
};

/**
 * Builds lookup tables for item numbers and wear history one time per data
 * change.
 *
 * The screens used to call `clothingItems.findIndex` and filter every outfit
 * inside each card, which is O(items x outfits) work on every render. These maps
 * make each lookup constant time.
 */
export const useWearIndex = (): WearIndex => {
  const clothingItems = useStore(s => s.clothingItems);
  const outfits = useStore(s => s.outfits);

  return useMemo(() => {
    const numbers = new Map<string, number>();
    clothingItems.forEach((item, idx) => numbers.set(item.id, item.itemNumber ?? idx + 1));

    const dates = new Map<string, number[]>();
    outfits.forEach(outfit => {
      const t = new Date(outfit.dateWorn).getTime();
      if (Number.isNaN(t)) return;
      outfit.itemIds.forEach(id => {
        const arr = dates.get(id);
        if (arr) arr.push(t);
        else dates.set(id, [t]);
      });
    });
    dates.forEach(arr => arr.sort((a, b) => b - a));

    return {
      numberOf: id => numbers.get(id) ?? 0,
      wearDates: id => dates.get(id) ?? [],
      wearCount: id => (dates.get(id) ?? []).length,
      lastWornLabel: id => lastWornLabelFrom(dates.get(id) ?? []),
    };
  }, [clothingItems, outfits]);
};
