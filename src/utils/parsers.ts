import { ClothingItem, Outfit } from '../store/useStore';

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);

export type ParsedItems = {
  items: ClothingItem[];
  /** Lines that came before any known sub-category, so the parser dropped them. */
  skipped: string[];
};

export const parseBulkItems = (text: string, categoryMap: Record<string, string>): ParsedItems => {
  // Supports format: Subcategory name on its own line starts a new item.
  // We detect subcategories by checking against the passed categoryMap.

  const lines = text.split('\n').map(l => l.trim());
  const items: ClothingItem[] = [];
  const skipped: string[] = [];

  let currentSubCategory: string | null = null;
  let currentDescLines: string[] = [];

  const flush = () => {
    if (!currentSubCategory) return;
    const description = currentDescLines.join('\n').trim();
    const hierarchyCategory = categoryMap[currentSubCategory] || 'Misc';
    items.push({
      id: generateId(),
      name: currentSubCategory,
      description,
      hierarchyCategory,
      subCategory: currentSubCategory,
      imageUri: '',
      originalGalleryUri: '',
      season: [],
      color: '',
      location: '',
      brand: '',
      price: 0,
      size: '',
      link: '',
      purchaseDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    currentSubCategory = null;
    currentDescLines = [];
  };

  for (const line of lines) {
    if (line === '') continue; // Simple separator

    if (categoryMap[line] !== undefined) {
      // New item boundary
      flush();
      currentSubCategory = line;
    } else if (currentSubCategory !== null) {
      currentDescLines.push(line);
    } else {
      // No known sub-category yet, so this line has no item to go with.
      skipped.push(line);
    }
  }
  flush();

  return { items, skipped };
};

export const exportItemsToText = (items: ClothingItem[]): string => {
  // Items are already in order of the clothingItems array which matches UI indexing
  return items.map(item => {
    return `${item.subCategory}\n${item.description || ''}`;
  }).join('\n\n');
};

/**
 * The number that the app shows for an item.
 *
 * A saved `itemNumber` stays with the item for its whole life, so a deletion
 * never renumbers the rest of the closet. Items from an older import have no
 * saved number, so the position in the list is the fallback.
 */
const displayNumber = (item: ClothingItem, idx: number) => item.itemNumber ?? idx + 1;

export const exportOutfitsToText = (outfits: Outfit[], items: ClothingItem[]): string => {
  // Sort outfits by date descending for better organization
  const sortedOutfits = [...outfits].sort((a, b) =>
    new Date(b.dateWorn).getTime() - new Date(a.dateWorn).getTime()
  );

  const numberById = new Map<string, number>();
  items.forEach((item, idx) => numberById.set(item.id, displayNumber(item, idx)));

  return sortedOutfits.map(outfit => {
    const d = new Date(outfit.dateWorn);
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
    const numbers = outfit.itemIds
      .map(id => numberById.get(id))
      .filter((n): n is number => typeof n === 'number')
      .sort((a, b) => a - b);

    return `${dateStr} ${numbers.join(' ')}`;
  }).join('\n');
};

export const parseBulkOutfits = (text: string, existingItems: ClothingItem[]): Outfit[] => {
  // Format: one line per day → M/D num1 num2 ...
  // The numbers are the item numbers that the app shows, so the text that
  // "Export Outfit History" makes reads back to the same items.
  // Example: "4/8 1 3" means April 8th, wore item #1 and item #3.
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const outfits: Outfit[] = [];
  const currentYear = new Date().getFullYear();

  const itemByNumber = new Map<number, ClothingItem>();
  existingItems.forEach((item, idx) => {
    const n = displayNumber(item, idx);
    // The first item with a number wins, so a repeated number cannot hide one.
    if (!itemByNumber.has(n)) itemByNumber.set(n, item);
  });

  for (const line of lines) {
    const tokens = line.split(/[\s\t]+/).filter(t => t.length > 0);
    if (tokens.length < 2) continue;

    const [month, day] = tokens[0].split('/').map(Number);
    if (isNaN(month) || isNaN(day)) continue;

    const dateWorn = new Date(currentYear, month - 1, day);
    const itemIds: string[] = [];

    for (const token of tokens.slice(1)) {
      const num = parseInt(token, 10);
      if (isNaN(num)) continue;
      const item = itemByNumber.get(num);
      if (item && !itemIds.includes(item.id)) {
        itemIds.push(item.id);
      }
    }

    if (itemIds.length > 0) {
      outfits.push({
        id: generateId(),
        dateWorn: dateWorn.toISOString(),
        itemIds,
        isFavorite: false,
      });
    }
  }

  return outfits;
};
