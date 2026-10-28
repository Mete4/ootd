import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { useStore } from '../store/useStore';
import { isRemotePhoto, photoFilenameOf } from './media';
import { runPool, sharedPhotoUrlFor } from './sync';

/**
 * Brings back photos that the app can no longer find.
 *
 * Why photos go missing: until SDK 56, Expo Go on Android put every project's
 * `Paths.document` in one shared folder. SDK 56 moved each project into its own
 * folder inside that one, and shipped no migration
 * (https://github.com/expo/expo/pull/45977). The records survived the update,
 * so the closet still lists every item, but each photo file stayed behind in
 * the old shared folder while the app now looks in the new one.
 *
 * The repair never changes a saved record. It only puts each file back where
 * the record already says it is. It never overwrites a file that is there.
 */

/**
 * How many folders above the current document folder to search. Expo Go is
 * expected to put the new folder two levels under the old one
 * (`ExperienceData/<project key>`). One more level covers a layout that is not
 * exactly that.
 */
const OLD_FOLDER_SEARCH_DEPTH = 3;

/** Downloads in flight at once when photos come back from a share link. */
const DOWNLOAD_CONCURRENCY = 6;

/** One photo the app can no longer find. */
export type MissingPhoto = {
  filename: string;
  /** Set for an item photo. Outfit photos have no share or gallery copy. */
  itemId?: string;
  /** Where the photo import first read the picture from, if it was imported. */
  galleryUri?: string;
};

export type PhotoRepairProgress = { done: number; total: number };

export type PhotoRepairResult = {
  missingCount: number;
  restoredFromOldFolder: number;
  restoredFromGallery: number;
  restoredFromShareLink: number;
  stillMissingCount: number;
  /** Expo Go refused to read the old folder, rather than the file being absent. */
  isOldFolderBlocked: boolean;
};

/** Photo repair has nothing to do on the web, which has no document folder. */
export const isPhotoRepairSupported = Platform.OS !== 'web';

/**
 * Lists every photo whose file is not in the document folder.
 *
 * `includeAttempted` false leaves out photos the automatic repair already
 * tried, so a photo that is gone for good does not slow down every launch.
 */
export const findMissingPhotos = (includeAttempted: boolean): MissingPhoto[] => {
  if (!isPhotoRepairSupported) return [];

  const { clothingItems, outfits, photoRepairAttempted } = useStore.getState();
  const attempted = new Set(includeAttempted ? [] : photoRepairAttempted);
  const seen = new Set<string>();
  const missing: MissingPhoto[] = [];

  const consider = (stored: string | undefined, extra: Omit<MissingPhoto, 'filename'>) => {
    if (!stored || isRemotePhoto(stored)) return;
    const filename = photoFilenameOf(stored);
    if (!filename || seen.has(filename) || attempted.has(filename)) return;
    seen.add(filename);
    if (!new File(Paths.document, filename).exists) missing.push({ filename, ...extra });
  };

  clothingItems.forEach(item => consider(item.imageUri, {
    itemId: item.id,
    galleryUri: item.originalGalleryUri || undefined,
  }));
  outfits.forEach(outfit => consider(outfit.ootdImageUri, {}));

  return missing;
};

/** The folders above `start`, nearest first. */
const foldersAbove = (start: Directory, depth: number): Directory[] => {
  const folders: Directory[] = [];
  let current = start;
  for (let level = 0; level < depth; level++) {
    let parent: Directory;
    try {
      parent = current.parentDirectory;
    } catch {
      break;
    }
    // The root is its own parent.
    if (parent.uri === current.uri) break;
    folders.push(parent);
    current = parent;
  }
  return folders;
};

/**
 * Restores `photos`, trying the cheapest source first:
 *
 * 1. the old shared Expo Go folder, which is a copy on the phone;
 * 2. the picture the photo import first read, if it is still there;
 * 3. the share link, if the closet was ever shared, which needs the network.
 */
export const repairMissingPhotos = async (
  photos: MissingPhoto[],
  onProgress: (progress: PhotoRepairProgress) => void,
): Promise<PhotoRepairResult> => {
  const result: PhotoRepairResult = {
    missingCount: photos.length,
    restoredFromOldFolder: 0,
    restoredFromGallery: 0,
    restoredFromShareLink: 0,
    stillMissingCount: 0,
    isOldFolderBlocked: false,
  };
  if (photos.length === 0) return result;

  const oldFolders = foldersAbove(Paths.document, OLD_FOLDER_SEARCH_DEPTH);
  const { shareToken, vacationShare } = useStore.getState();
  // The full closet link holds every item. The packing list link holds some.
  const shareTokens = [shareToken, vacationShare?.token].filter((t): t is string => !!t);

  let done = 0;
  const report = () => onProgress({ done, total: photos.length });
  report();

  const fromLocalCopy = async (photo: MissingPhoto, destination: File) => {
    if (!result.isOldFolderBlocked) {
      for (const folder of oldFolders) {
        try {
          const source = new File(folder, photo.filename);
          if (!source.exists) continue;
          await source.copy(destination);
          result.restoredFromOldFolder += 1;
          return true;
        } catch (e) {
          // Expo Go keeps each project to its own folder. If it refuses the old
          // one, it refuses it for every photo, so stop asking.
          console.log('Photo repair could not read the old folder', e);
          result.isOldFolderBlocked = true;
          break;
        }
      }
    }

    if (photo.galleryUri) {
      try {
        const source = new File(photo.galleryUri);
        if (source.exists) {
          await source.copy(destination);
          result.restoredFromGallery += 1;
          return true;
        }
      } catch {
        // The picker's copy was in a cache that has since been cleared.
      }
    }
    return false;
  };

  const fromShareLink = async (photo: MissingPhoto, destination: File) => {
    if (!photo.itemId) return false;
    for (const token of shareTokens) {
      try {
        await File.downloadFileAsync(sharedPhotoUrlFor(token, photo.itemId), destination);
        result.restoredFromShareLink += 1;
        return true;
      } catch {
        // Not in this share, or no network. Try the next one.
      }
    }
    return false;
  };

  // Local copies first and one at a time: they are fast, and copying many large
  // files at once only fights over the same storage.
  const needDownload: MissingPhoto[] = [];
  for (const photo of photos) {
    const destination = new File(Paths.document, photo.filename);
    if (await fromLocalCopy(photo, destination)) {
      done += 1;
      report();
    } else {
      needDownload.push(photo);
    }
  }

  await runPool(needDownload, DOWNLOAD_CONCURRENCY, async photo => {
    const destination = new File(Paths.document, photo.filename);
    if (!(await fromShareLink(photo, destination))) result.stillMissingCount += 1;
    done += 1;
    report();
  });

  useStore.getState().markPhotoRepairAttempted(photos.map(p => p.filename));
  return result;
};

/** One line for a toast that says what the repair did. */
export const photoRepairSummary = (result: PhotoRepairResult): string => {
  const restored = result.restoredFromOldFolder + result.restoredFromGallery + result.restoredFromShareLink;
  const photoWord = (n: number) => `${n} photo${n === 1 ? '' : 's'}`;

  if (result.stillMissingCount === 0) return `Restored ${photoWord(restored)}.`;

  const parts = [];
  if (restored > 0) parts.push(`Restored ${photoWord(restored)}`);
  parts.push(`${photoWord(result.stillMissingCount)} could not be found`);
  let line = parts.join('. ') + '.';
  if (result.isOldFolderBlocked) line += ' Expo Go blocked the old folder.';
  return line;
};
