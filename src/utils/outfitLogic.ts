import { ClothingItem, Outfit } from '../store/useStore';
import { lastWornLabelFrom } from './format';

type ItemMap = Map<string, ClothingItem>;

/** Indexes the items by id one time. */
export const indexItems = (items: ClothingItem[]): ItemMap => {
  const map: ItemMap = new Map();
  items.forEach(i => map.set(i.id, i));
  return map;
};

export type BaseKey = { tops: string[]; bottoms: string[]; hasLayer: boolean };

/**
 * Splits a set of item ids into the tops and the bottoms that define the base of
 * an outfit.
 *
 * This walks the ids one time against a map. The old version called
 * `items.find` for each id, so every caller paid O(ids x items).
 */
export const baseKeyFrom = (itemIds: string[], map: ItemMap): BaseKey => {
  const tops: string[] = [];
  const bottoms: string[] = [];
  let hasJacket = false;

  for (const id of itemIds) {
    const item = map.get(id);
    if (!item) continue;
    if (item.hierarchyCategory === 'Tops') tops.push(item.id);
    else if (item.hierarchyCategory === 'Bottoms') bottoms.push(item.id);
    else if (item.hierarchyCategory === 'Jackets') hasJacket = true;
  }

  tops.sort();
  bottoms.sort();
  return { tops, bottoms, hasLayer: hasJacket || tops.length > 1 };
};

export const getBaseOutfitKey = (itemIds: string[], items: ClothingItem[]): BaseKey =>
  baseKeyFrom(itemIds, indexItems(items));

/**
 * Returns the date of the most recent outfit with the same base, or null.
 */
export const checkIsDuplicateBase = (
  currentSelectionIds: string[],
  outfits: Outfit[],
  items: ClothingItem[]
): string | null => {
  const map = indexItems(items);
  const current = baseKeyFrom(currentSelectionIds, map);

  if (current.tops.length === 0 || current.bottoms.length === 0) return null;
  // A layer makes the outfit different, so the warning does not apply.
  if (current.hasLayer) return null;

  const topsStr = current.tops.join(',');
  const bottomsStr = current.bottoms.join(',');

  let newest: Outfit | null = null;
  let newestTime = -Infinity;

  for (const outfit of outfits) {
    const base = baseKeyFrom(outfit.itemIds, map);
    if (base.tops.join(',') !== topsStr) continue;
    if (base.bottoms.join(',') !== bottomsStr) continue;

    const t = new Date(outfit.dateWorn).getTime();
    if (t > newestTime) {
      newestTime = t;
      newest = outfit;
    }
  }

  return newest ? (newest.dateWorn as string) : null;
};

/**
 * Returns the items to gray out, which are the pieces already worn with the
 * current selection.
 */
export const getGrayOutItemIds = (
  currentSelectionIds: string[],
  outfits: Outfit[],
  items: ClothingItem[]
): string[] => {
  const map = indexItems(items);
  const current = baseKeyFrom(currentSelectionIds, map);
  const grayOut = new Set<string>();

  if (current.tops.length === 0 && current.bottoms.length === 0) return [];

  for (const outfit of outfits) {
    const base = baseKeyFrom(outfit.itemIds, map);

    if (current.tops.length > 0 && current.tops.every(t => base.tops.includes(t))) {
      base.bottoms.forEach(b => grayOut.add(b));
    }
    if (current.bottoms.length > 0 && current.bottoms.every(b => base.bottoms.includes(b))) {
      base.tops.forEach(t => grayOut.add(t));
    }
  }

  return Array.from(grayOut);
};

/**
 * Maps each item id to its wear timestamps, newest first.
 */
export const indexWearDates = (outfits: Outfit[]): Map<string, number[]> => {
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
  return dates;
};

/** Describes when an item was last worn, for example "Today" or "3d ago". */
export const getLastWornLabel = (itemId: string, outfits: Outfit[]) =>
  lastWornLabelFrom(indexWearDates(outfits).get(itemId) ?? []);
