import { supabase } from '../lib/supabase';
import { ClothingItem, Outfit } from '../store/useStore';
import { File, Paths } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { photoFilenameOf } from './media';
import { baseKeyFrom, indexItems } from './outfitLogic';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://zcipgvyhzttxhyytczbv.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_dc_NntGPiAUiQpROowHGww_7c9mzhHe';

export type ShareScope = 'full' | 'vacation';

/** The address a friend opens. Kept here so only one file knows the format. */
export const shareUrlFor = (token: string) => `https://ootd-viewer.vercel.app/closet/${token}`;

/**
 * Where a share keeps the photo of one item. The upload writes here, the
 * shared page reads from here, and the photo repair downloads from here.
 */
export const sharedPhotoUrlFor = (token: string, itemId: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/closet-images/${token}/${itemId}.jpg`;

/** Adds the photo version to an address. Storage ignores the query. */
const versionedPhotoUrl = (url: string, version: string | undefined) =>
  version ? `${url}?v=${encodeURIComponent(version)}` : url;

/**
 * How many images are handed to the operating system at the same time.
 *
 * `uploadAsync` defaults to a background session, so iOS keeps each transfer
 * going after you leave the app. Only the uploads already started survive that,
 * which is the reason this runs a pool instead of a plain loop: a loop only ever
 * has one transfer in flight, so leaving the app stalled everything after it.
 *
 * Higher is not better. Each transfer holds memory and a socket, and a phone on
 * a weak connection starts timing out.
 */
const UPLOAD_CONCURRENCY = 8;

export type SyncArgs = {
  scope: ShareScope;
  /** Null mints a new link. */
  token: string | null;
  /** Proves you own `token`. Null with a token claims that old link first. */
  secret: string | null;
  /** The items of this link. Archived items in it are left out. */
  items: ClothingItem[];
  /**
   * The whole closet, archived items included. An outfit's base (its tops and
   * bottoms) is computed from it, so that the viewer grays out and warns the
   * same as the app, also for outfits with archived items.
   */
  clothingItems: ClothingItem[];
  outfits: Outfit[];
  /** Null never expires. A number sets the expiry that many days ahead. */
  ttlDays: number | null;
  /** Fingerprints of images already uploaded, keyed `token/itemId`. */
  knownFingerprints: Record<string, string>;
  /** Called the moment one image lands, so a stopped share resumes cheaply. */
  onUploaded: (key: string, fingerprint: string) => void;
  /**
   * Called once when the app gets the owner secret for a link, before any slow
   * work: for a new link, and for an old link it claimed.
   */
  onShareOwned: (token: string, secret: string) => void;
  /** Called for each photo deleted from the link, keyed `token/itemId`. */
  onPhotoDeleted: (key: string) => void;
  onProgress: (msg: string) => void;
};

export type SyncResult = {
  token: string;
  secret: string;
  uploaded: number;
  skipped: number;
  failed: number;
  /** The old link could not be claimed, so this is a new address to send again. */
  isLinkReplaced: boolean;
  /** Photos deleted from the link because no shared item uses them now. */
  deletedPhotos: number;
  /** The unused photos could not be listed or deleted, so some may remain. */
  isPhotoCleanupFailed: boolean;
};

/**
 * Cheap stand-in for a content hash: the size and the modification time. Both
 * change when you replace a photo, and neither needs the file to be read.
 */
const fingerprintOf = async (localUri: string): Promise<string | null> => {
  try {
    const info = await FileSystemLegacy.getInfoAsync(resolveForUpload(localUri));
    if (!info.exists) return null;
    const size = (info as any).size ?? 0;
    const mtime = (info as any).modificationTime ?? 0;
    return `${size}:${mtime}`;
  } catch {
    return null;
  }
};

/** Turns whatever the picker gave us into a URI the uploader accepts. */
const resolveForUpload = (localUri: string): string => {
  if (localUri.startsWith('file://') || localUri.startsWith('content://')) return localUri;
  return new File(Paths.document, localUri).uri;
};

/**
 * Uploads one photo into the folder of a share link. Storage accepts it only
 * with the owner secret of that link (20261014_share_photo_owner_only.sql).
 */
const uploadImageToStorage = async (localUri: string, storagePath: string, secret: string): Promise<void> => {
  let fileUri = resolveForUpload(localUri);

  // Android hands back content:// URIs that the uploader cannot read directly.
  if (fileUri.startsWith('content://')) {
    const extMatch = fileUri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    const ext = extMatch ? extMatch[1] : 'jpg';
    const destFile = new File(Paths.cache, `${Math.random().toString(36).slice(2)}.${ext}`);
    new File(fileUri).copy(destFile);
    fileUri = destFile.uri;
  }

  const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${encodedPath}`;

  let attempt = 0;
  const maxAttempts = 3;
  for (;;) {
    try {
      const result = await FileSystemLegacy.uploadAsync(uploadUrl, fileUri, {
        httpMethod: 'PUT',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'image/jpeg',
          'x-upsert': 'true',
          'x-share-secret': secret,
        },
      });
      if (result.status >= 400) {
        throw new Error(`status ${result.status}: ${result.body}`);
      }
      return;
    } catch (err) {
      attempt += 1;
      if (attempt >= maxAttempts) {
        throw new Error(`upload failed for ${localUri}: ${err instanceof Error ? err.message : String(err)}`);
      }
      await new Promise(res => setTimeout(res, 300 * attempt));
    }
  }
};

/**
 * Lists the file names in the folder of a share link, for example `abc.jpg`.
 * Storage lists a folder only with the owner secret
 * (20261014_share_close_open_reads.sql).
 */
const listSharedPhotos = async (token: string, secret: string): Promise<string[]> => {
  const pageSize = 1000;
  const names: string[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/list/closet-images`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'x-share-secret': secret,
      },
      body: JSON.stringify({ prefix: token, limit: pageSize, offset }),
    });
    if (!response.ok) {
      throw new Error(`Could not list the photos of the link: status ${response.status}: ${await response.text()}`);
    }
    const entries: { name: string; id: string | null }[] = await response.json();
    // A null id marks a sub-folder, not a file.
    names.push(...entries.filter(entry => entry.id).map(entry => entry.name));
    if (entries.length < pageSize) return names;
  }
};

/**
 * Deletes photos from the folder of a share link, and returns the file names
 * that storage deleted. Storage accepts it only with the owner secret
 * (20261014_share_photo_owner_delete.sql).
 */
const deleteSharedPhotos = async (token: string, names: string[], secret: string): Promise<string[]> => {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/closet-images`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      'x-share-secret': secret,
    },
    body: JSON.stringify({ prefixes: names.map(name => `${token}/${name}`) }),
  });
  if (!response.ok) throw new Error(`status ${response.status}: ${await response.text()}`);
  const deleted: { name: string }[] = await response.json();
  return deleted.map(entry => photoFilenameOf(entry.name));
};

/**
 * Deletes every photo in the link's folder that no shared item uses: the
 * photos of archived and deleted items, and photos removed from an item.
 * Returns how many it deleted.
 */
const deleteUnusedPhotos = async (
  token: string,
  secret: string,
  sharedItemsWithPhotos: ClothingItem[],
  onPhotoDeleted: (key: string) => void,
): Promise<number> => {
  const usedNames = new Set(sharedItemsWithPhotos.map(item => `${item.id}.jpg`));
  // A safety stop. If nothing is in use, a fault upstream is more likely than
  // a closet with no photos, and emptying the folder cannot be undone.
  if (usedNames.size === 0) return 0;

  const unusedNames = (await listSharedPhotos(token, secret)).filter(name => !usedNames.has(name));
  const batchSize = 100;
  let deleted = 0;
  for (let i = 0; i < unusedNames.length; i += batchSize) {
    const deletedNames = await deleteSharedPhotos(token, unusedNames.slice(i, i + batchSize), secret);
    for (const name of deletedNames) onPhotoDeleted(`${token}/${name.replace(/\.jpg$/, '')}`);
    deleted += deletedNames.length;
  }
  return deleted;
};

/** Runs `work` over `jobs`, never more than `limit` at a time. */
export const runPool = async <T>(jobs: T[], limit: number, work: (job: T) => Promise<void>) => {
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= jobs.length) return;
      await work(jobs[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
};

export const syncClosetToCloud = async (args: SyncArgs): Promise<SyncResult> => {
  const {
    scope, items, outfits, ttlDays,
    knownFingerprints, onUploaded, onShareOwned, onPhotoDeleted, onProgress,
  } = args;

  let token = args.token;
  let secret = args.secret;
  let isLinkReplaced = false;

  // Archived items stay in your own records and never reach a shared link.
  const activeItems = items.filter(item => !item.archived);

  // 1. A link made before owner secrets cannot be saved to. Claim it, so the
  //    address your friends already have shows the update.
  if (token && !secret) {
    onProgress('Claiming your link...');
    const { data, error } = await supabase.rpc('adopt_legacy_share', { p_token: token });
    if (!error && typeof data === 'string' && data) {
      secret = data;
      onShareOwned(token, secret);
    } else {
      // Expired, deleted, or claimed by someone else. Only a new link is left.
      console.log('Could not claim the old link', error);
      token = null;
      isLinkReplaced = true;
    }
  }

  // 2. Mint a link if this scope does not have one yet.
  if (!token || !secret) {
    onProgress('Creating the link...');
    const { data, error } = await supabase.rpc('create_share', {
      p_scope: scope,
      p_ttl_days: ttlDays,
    });
    if (error) throw new Error(`Could not create the link: ${error.message}`);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.out_token || !row?.out_secret) throw new Error('The server returned no link');
    token = row.out_token as string;
    secret = row.out_secret as string;
    // Saved before the slow part, so a share that dies mid-upload is resumable.
    onShareOwned(token, secret);
  }

  // 3. Work out which photos actually need sending.
  onProgress('Checking which photos changed...');
  const withImages = activeItems.filter(i => i.imageUri);
  const jobs: { item: ClothingItem; key: string; fingerprint: string }[] = [];
  // The fingerprint goes into the shared address as a version, so a browser
  // never shows a replaced photo from its cache.
  const photoVersionByItemId = new Map<string, string>();
  let skipped = 0;

  for (const item of withImages) {
    const key = `${token}/${item.id}`;
    const fingerprint = await fingerprintOf(item.imageUri!);
    if (fingerprint) photoVersionByItemId.set(item.id, fingerprint);
    if (fingerprint && knownFingerprints[key] === fingerprint) {
      skipped += 1;
      continue;
    }
    jobs.push({ item, key, fingerprint: fingerprint ?? String(Date.now()) });
  }

  // 4. Upload what is left, several at a time.
  let done = 0;
  let failed = 0;
  if (jobs.length > 0) {
    onProgress(`Uploading ${jobs.length} photo${jobs.length === 1 ? '' : 's'}...`);
    await runPool(jobs, UPLOAD_CONCURRENCY, async job => {
      try {
        await uploadImageToStorage(job.item.imageUri!, `closet-images/${token}/${job.item.id}.jpg`, secret);
        onUploaded(job.key, job.fingerprint);
      } catch (e) {
        failed += 1;
        console.log(`Image for item ${job.item.id} did not upload`, e);
      }
      done += 1;
      onProgress(`Uploaded ${done} of ${jobs.length}...`);
    });
  }

  // 5. Save the closet itself.
  onProgress('Saving your closet...');

  const itemsMetadata = activeItems.map(item => ({
    id: item.id,
    // The number on the card. The viewer must show this, not the item's place
    // in this list, because archived items are left out of the list.
    itemNumber: item.itemNumber,
    name: item.name,
    description: item.description,
    brand: item.brand,
    color: item.color,
    size: item.size,
    hierarchyCategory: item.hierarchyCategory,
    subCategory: item.subCategory,
    season: item.season,
    imageUrl: item.imageUri ? versionedPhotoUrl(sharedPhotoUrlFor(token, item.id), photoVersionByItemId.get(item.id)) : null,
  }));

  // Outfit names and notes are yours. Only the date and the items are shared.
  // `base` is computed here from the whole closet, because the viewer cannot
  // see the category of an archived item.
  const closetIndex = indexItems(args.clothingItems);
  const outfitsMetadata = outfits.map(outfit => {
    const { tops, bottoms } = baseKeyFrom(outfit.itemIds, closetIndex);
    return {
      id: outfit.id,
      dateWorn: outfit.dateWorn,
      itemIds: outfit.itemIds,
      base: { tops, bottoms },
    };
  });

  const { error: saveErr } = await supabase.rpc('save_share', {
    p_token: token,
    p_secret: secret,
    p_items: itemsMetadata,
    p_outfits: outfitsMetadata,
    p_scope: scope,
    p_ttl_days: ttlDays,
  });

  if (saveErr) {
    if (/not authorised/i.test(saveErr.message)) {
      throw new Error('This link belongs to another device. Make a new link instead.');
    }
    throw new Error(saveErr.message);
  }

  // 6. Delete the photos that the link no longer uses. This comes after the
  //    save, so the shared closet never points at a photo that is gone. A
  //    failure here does not undo the share: the closet is already saved.
  onProgress('Deleting old photos...');
  let deletedPhotos = 0;
  let isPhotoCleanupFailed = false;
  try {
    deletedPhotos = await deleteUnusedPhotos(token, secret, withImages, onPhotoDeleted);
  } catch (e) {
    isPhotoCleanupFailed = true;
    console.log('Old photos were not deleted', e);
  }

  onProgress('Done');
  return {
    token, secret,
    uploaded: jobs.length - failed, skipped, failed,
    isLinkReplaced, deletedPhotos, isPhotoCleanupFailed,
  };
};
