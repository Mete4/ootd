import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ClothingItem = {
  id: string;
  name: string;
  description: string;
  hierarchyCategory: string; // Tops, Bottoms, Shoes, Jackets, Misc
  subCategory: string;
  imageUri: string;
  originalGalleryUri: string;
  season: string[];
  color: string;
  location: string;
  brand: string;
  price: number;
  size: string;
  link: string;
  purchaseDate: Date | string;
  createdAt: Date | string;
  lastWornDate?: Date | string;
  archived?: boolean; // hidden from closet/builder but kept for records
  /**
   * Stable display number. It is assigned one time when the item is created and
   * never changes. The screens used to show the array index, so deleting an item
   * renumbered every item after it.
   */
  itemNumber?: number;
};

export type Outfit = {
  id: string;
  dateWorn: Date | string;
  itemIds: string[];
  isFavorite: boolean;
  ootdImageUri?: string;
  name?: string;        // optional custom outfit name
  note?: string;        // optional note/caption
};

export type VacationShare = {
  token: string;
  secret: string;
  /** ISO date. After this the link stops resolving and the data is deleted. */
  expiresAt: string;
};

/** How long a vacation link stays alive. */
export const VACATION_SHARE_DAYS = 14;

interface AppState {
  clothingItems: ClothingItem[];
  outfits: Outfit[];
  currentOutfitSelection: string[];
  homeDate: string;
  shareToken: string | null;
  /**
   * Proves you own the full-closet share. The database refuses a write without
   * it, so losing this means you can no longer update that link.
   */
  shareSecret: string | null;
  /** A vacation link is a separate, smaller closet that expires on its own. */
  vacationShare: VacationShare | null;
  /**
   * Fingerprint of each image already uploaded, keyed `token/itemId`. An
   * unchanged photo is skipped on the next share.
   */
  uploadedFingerprints: Record<string, string>;
  suggestionsLastViewedAtByToken: Record<string, string>;
  // Vacation mode: restrict the outfit builder to the items you packed
  vacationMode: boolean;
  vacationItemIds: string[];
  /** 'type' groups by sub-category name. 'index' uses the item number. */
  closetSort: 'type' | 'index';
  /** Category names the user folded shut in the Closet and Vacation grids. */
  collapsedCats: string[];
  /**
   * Photo file names the start-up repair already tried to bring back. The
   * repair runs by itself once per photo, so a photo that is gone for good does
   * not hold up every launch. Settings can clear this to try again.
   */
  photoRepairAttempted: string[];

  // Actions
  markPhotoRepairAttempted: (filenames: string[]) => void;
  clearPhotoRepairAttempts: () => void;
  setClosetSort: (mode: 'type' | 'index') => void;
  toggleCatCollapsed: (cat: string) => void;
  setAllCatsCollapsed: (cats: string[]) => void;
  setShare: (token: string, secret: string) => void;
  setVacationShare: (share: VacationShare | null) => void;
  rememberUpload: (key: string, fingerprint: string) => void;
  /** Forgets one photo, keyed `token/itemId`, after it is deleted from the link. */
  forgetUpload: (key: string) => void;
  forgetUploads: (token: string) => void;
  setVacationMode: (on: boolean) => void;
  setVacationItems: (ids: string[]) => void;
  toggleVacationItem: (id: string) => void;
  setHomeDate: (date: string) => void;
  setShareToken: (token: string) => void;
  markSuggestionsViewed: (token: string, viewedAt: string) => void;
  addItem: (item: ClothingItem) => void;
  updateItem: (item: ClothingItem) => void;
  addOutfit: (outfit: Outfit) => void;
  updateOutfit: (outfit: Outfit) => void;
  deleteItem: (id: string) => void;
  deleteItems: (ids: string[]) => void;
  deleteOutfit: (id: string) => void;
  setCurrentOutfitSelection: (ids: string[]) => void;
  addToCurrentOutfit: (id: string) => void;
  removeFromCurrentOutfit: (id: string) => void;
  updateItems: (ids: string[], updates: Partial<ClothingItem>) => void;
  setItemsArchived: (ids: string[], archived: boolean) => void;
  bulkImportItems: (items: ClothingItem[]) => { added: number; duplicates: number; highestNumber: number };
  bulkImportOutfits: (outfits: Outfit[]) => { added: number; duplicates: number };
  // Category management
  hierarchyCats: string[];
  subCats: Record<string, string[]>;
  categoryMap: Record<string, string>;
  addCustomSubCategory: (hierarchy: string, sub: string) => void;
  deduplicateCloset: () => void;
}

/** Returns the next free display number. */
const nextItemNumber = (items: ClothingItem[]) =>
  items.reduce((max, i) => Math.max(max, i.itemNumber ?? 0), items.length) + 1;

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      clothingItems: [],
      outfits: [],
      currentOutfitSelection: [],
      homeDate: new Date().toISOString(),
      shareToken: null,
      shareSecret: null,
      vacationShare: null,
      uploadedFingerprints: {},
      suggestionsLastViewedAtByToken: {},
      vacationMode: false,
      vacationItemIds: [],
      closetSort: 'type',
      collapsedCats: [],
      photoRepairAttempted: [],
      hierarchyCats: ['Tops', 'Bottoms', 'Jackets', 'Shoes', 'Misc'],
      subCats: {
        Tops: ['T-shirt', 'Sweater', 'Sweatshirt', 'Long-Sleeve Top', 'Long-Sleeve T-Shirt', 'Polo Shirt', 'Short-Sleeve Button-Up Shirt', 'Button-Up Shirt', 'Short-Sleeve Camp Shirt'],
        Bottoms: ['Jeans', 'Trousers', 'Chinos', 'Dress Pants', 'Cargo Pants', 'Hiking Pants', 'Sweatpants', 'Shorts', 'Cargo Shorts', 'Chino Shorts'],
        Jackets: ['Vest', 'Fleece Pullover', 'Jacket', 'Zip-Up Sweater', 'Zip-Up Hoodie', 'Faux Leather Jacket', 'Winter Parka'],
        Shoes: ['Loafers', 'Slide Sandals', 'Hiking Boots', 'Work Boots', 'Skate Sneakers', 'Running Shoes', 'Thong Sandals', 'Casual Sneakers'],
        Misc: ['Hooded Robe', 'Hat', 'Belt', 'Watch', 'Bag'],
      },
      categoryMap: {
        'T-shirt': 'Tops', 'Sweater': 'Tops', 'Sweatshirt': 'Tops', 'Long-Sleeve Top': 'Tops', 'Long-Sleeve T-Shirt': 'Tops', 'Polo Shirt': 'Tops', 'Short-Sleeve Button-Up Shirt': 'Tops', 'Button-Up Shirt': 'Tops', 'Short-Sleeve Camp Shirt': 'Tops',
        'Jeans': 'Bottoms', 'Trousers': 'Bottoms', 'Chinos': 'Bottoms', 'Dress Pants': 'Bottoms', 'Cargo Pants': 'Bottoms', 'Hiking Pants': 'Bottoms', 'Sweatpants': 'Bottoms', 'Shorts': 'Bottoms', 'Cargo Shorts': 'Bottoms', 'Chino Shorts': 'Bottoms',
        'Loafers': 'Shoes', 'Slide Sandals': 'Shoes', 'Hiking Boots': 'Shoes', 'Work Boots': 'Shoes', 'Skate Sneakers': 'Shoes', 'Running Shoes': 'Shoes', 'Thong Sandals': 'Shoes', 'Casual Sneakers': 'Shoes',
        'Vest': 'Jackets', 'Fleece Pullover': 'Jackets', 'Jacket': 'Jackets', 'Zip-Up Sweater': 'Jackets', 'Zip-Up Hoodie': 'Jackets', 'Faux Leather Jacket': 'Jackets', 'Winter Parka': 'Jackets',
        'Hooded Robe': 'Misc', 'Hat': 'Misc', 'Belt': 'Misc', 'Watch': 'Misc', 'Bag': 'Misc',
      },

      markPhotoRepairAttempted: (filenames) => set((state) => ({
        photoRepairAttempted: Array.from(new Set([...state.photoRepairAttempted, ...filenames])),
      })),
      clearPhotoRepairAttempts: () => set({ photoRepairAttempted: [] }),
      setClosetSort: (mode) => set({ closetSort: mode }),
      toggleCatCollapsed: (cat) => set((state) => ({
        collapsedCats: state.collapsedCats.includes(cat)
          ? state.collapsedCats.filter((c) => c !== cat)
          : [...state.collapsedCats, cat],
      })),
      setAllCatsCollapsed: (cats) => set({ collapsedCats: cats }),
      setShare: (token, secret) => set({ shareToken: token, shareSecret: secret }),
      setVacationShare: (share) => set({ vacationShare: share }),
      rememberUpload: (key, fingerprint) => set((state) => ({
        uploadedFingerprints: { ...state.uploadedFingerprints, [key]: fingerprint },
      })),
      // Without this, a photo deleted from the link would count as sent, and
      // restoring its item from the archive would not send it again.
      forgetUpload: (key) => set((state) => {
        if (!(key in state.uploadedFingerprints)) return state;
        const { [key]: _deleted, ...rest } = state.uploadedFingerprints;
        return { uploadedFingerprints: rest };
      }),
      // Called when a link is replaced, so a stale fingerprint cannot make the
      // next share skip an image it never actually uploaded.
      forgetUploads: (token) => set((state) => {
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(state.uploadedFingerprints)) {
          if (!k.startsWith(`${token}/`)) next[k] = v;
        }
        return { uploadedFingerprints: next };
      }),
      setVacationMode: (on) => set({ vacationMode: on }),
      setVacationItems: (ids) => set({ vacationItemIds: ids }),
      toggleVacationItem: (id) => set((state) => ({
        vacationItemIds: state.vacationItemIds.includes(id)
          ? state.vacationItemIds.filter((x) => x !== id)
          : [...state.vacationItemIds, id],
      })),
      setHomeDate: (date) => set({ homeDate: date }),
      setShareToken: (token) => set({ shareToken: token }),
      markSuggestionsViewed: (token, viewedAt) => set((state) => ({
        suggestionsLastViewedAtByToken: {
          ...state.suggestionsLastViewedAtByToken,
          [token]: viewedAt,
        },
      })),
      addItem: (item) => set((state) => ({
        clothingItems: [
          ...state.clothingItems,
          { ...item, itemNumber: item.itemNumber ?? nextItemNumber(state.clothingItems) },
        ],
      })),
      updateItem: (item) => set((state) => ({
        clothingItems: state.clothingItems.map((i) => (i.id === item.id ? item : i))
      })),
      addOutfit: (outfit) => set((state) => ({ outfits: [...state.outfits, outfit] })),
      updateOutfit: (outfit) => set((state) => ({
        outfits: state.outfits.map((o) => (o.id === outfit.id ? outfit : o))
      })),
      deleteItem: (id) => set((state) => ({
        clothingItems: state.clothingItems.filter((i) => i.id !== id),
        outfits: state.outfits.map(o => ({
          ...o,
          itemIds: o.itemIds.filter(itemId => itemId !== id)
        })),
        vacationItemIds: state.vacationItemIds.filter(itemId => itemId !== id)
      })),
      deleteItems: (ids) => set((state) => ({
        clothingItems: state.clothingItems.filter((i) => !ids.includes(i.id)),
        outfits: state.outfits.map(o => ({
          ...o,
          itemIds: o.itemIds.filter(itemId => !ids.includes(itemId))
        })),
        currentOutfitSelection: state.currentOutfitSelection.filter(id => !ids.includes(id)),
        vacationItemIds: state.vacationItemIds.filter(id => !ids.includes(id))
      })),
      deleteOutfit: (id) => set((state) => ({
        outfits: state.outfits.filter((o) => o.id !== id)
      })),
      setCurrentOutfitSelection: (ids) => set({ currentOutfitSelection: ids }),
      addToCurrentOutfit: (id) => set((state) => {
        if (!state.currentOutfitSelection.includes(id)) {
          return { currentOutfitSelection: [...state.currentOutfitSelection, id] };
        }
        return state;
      }),
      removeFromCurrentOutfit: (id) => set((state) => ({
        currentOutfitSelection: state.currentOutfitSelection.filter((i) => i !== id)
      })),
      updateItems: (ids, updates) => set((state) => ({
        clothingItems: state.clothingItems.map((i) => ids.includes(i.id) ? { ...i, ...updates } : i)
      })),
      setItemsArchived: (ids, archived) => set((state) => ({
        clothingItems: state.clothingItems.map((i) => ids.includes(i.id) ? { ...i, archived } : i),
        // Archived items shouldn't linger in an outfit that's currently being built
        currentOutfitSelection: archived
          ? state.currentOutfitSelection.filter((id) => !ids.includes(id))
          : state.currentOutfitSelection,
        vacationItemIds: archived
          ? state.vacationItemIds.filter((id) => !ids.includes(id))
          : state.vacationItemIds,
      })),
      bulkImportItems: (items) => {
        const state = get();
        const newItems = items.filter(newItem => {
          return !state.clothingItems.some(ex =>
            ex.subCategory === newItem.subCategory &&
            (ex.description || '') === (newItem.description || '')
          );
        });
        let next = nextItemNumber(state.clothingItems);
        const numbered = newItems.map(i => ({ ...i, itemNumber: i.itemNumber ?? next++ }));
        set({ clothingItems: [...state.clothingItems, ...numbered] });
        // The screen needs the real figures, because a duplicate never lands.
        return {
          added: numbered.length,
          duplicates: items.length - numbered.length,
          highestNumber: numbered.length ? numbered[numbered.length - 1].itemNumber ?? 0 : 0,
        };
      },
      bulkImportOutfits: (newOutfits) => {
        const state = get();
        const filtered = newOutfits.filter(newO => {
          const newDate = new Date(newO.dateWorn).toDateString();
          const newItems = [...newO.itemIds].sort().join(',');

          return !state.outfits.some(exO => {
            const exDate = new Date(exO.dateWorn).toDateString();
            const exItems = [...exO.itemIds].sort().join(',');
            return newDate === exDate && newItems === exItems;
          });
        });
        set({ outfits: [...state.outfits, ...filtered] });
        return { added: filtered.length, duplicates: newOutfits.length - filtered.length };
      },
      deduplicateCloset: () => set((state) => {
        const uniqueItems: typeof state.clothingItems = [];
        const seen = new Set<string>();

        state.clothingItems.forEach(item => {
          const key = `${item.hierarchyCategory}|${item.subCategory}|${item.description || ''}|${item.brand || ''}|${item.color || ''}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueItems.push(item);
          }
        });

        const keptIds = new Set(uniqueItems.map(i => i.id));
        const cleanOutfits = state.outfits.map(o => ({
          ...o,
          itemIds: o.itemIds.filter(id => keptIds.has(id))
        }));

        return { clothingItems: uniqueItems, outfits: cleanOutfits };
      }),
      addCustomSubCategory: (hierarchy, sub) => set((state) => {
        if (state.subCats[hierarchy]?.includes(sub)) return state;
        return {
          subCats: { ...state.subCats, [hierarchy]: [...(state.subCats[hierarchy] || []), sub] },
          categoryMap: { ...state.categoryMap, [sub]: hierarchy }
        };
      }),
    }),
    {
      name: 'ootd-storage',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        // Change absolute paths back to plain filenames.
        let hasChanges = false;

        let healedItems = state.clothingItems.map(item => {
          if (item.imageUri && item.imageUri.startsWith('file://')) {
            const filename = item.imageUri.split('/').pop() || '';
            hasChanges = true;
            return { ...item, imageUri: filename };
          }
          return item;
        });

        const healedOutfits = state.outfits.map(outfit => {
          if (outfit.ootdImageUri && outfit.ootdImageUri.startsWith('file://')) {
            const filename = outfit.ootdImageUri.split('/').pop() || '';
            hasChanges = true;
            return { ...outfit, ootdImageUri: filename };
          }
          return outfit;
        });

        // Give every old item a stable number. The current position becomes the
        // permanent number, so the numbers that the user already knows do not move.
        if (healedItems.some(i => i.itemNumber === undefined)) {
          healedItems = healedItems.map((item, idx) => (
            item.itemNumber === undefined ? { ...item, itemNumber: idx + 1 } : item
          ));
          hasChanges = true;
        }

        if (hasChanges) {
          // `state` is the rehydrated object, so assignment is enough here.
          state.clothingItems = healedItems;
          state.outfits = healedOutfits;
        }
      }
    }
  )
);
