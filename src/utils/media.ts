import { File, Paths } from 'expo-file-system';

/**
 * Resolves a stored filename or URI into a full path that can be used by an <Image> component.
 * This ensures that when the app container ID changes (common on iOS updates), we still find the file.
 */
export const resolveImageUri = (uriOrFilename?: string): string => {
  if (!uriOrFilename) return '';

  // If it's already a full web URL or a data URI, leave it be
  if (isRemotePhoto(uriOrFilename)) return uriOrFilename;

  return new File(Paths.document, photoFilenameOf(uriOrFilename)).uri;
};

/** True for a photo that lives on the web or inline, not in the app's folder. */
export const isRemotePhoto = (uri: string) => uri.startsWith('http') || uri.startsWith('data:');

/**
 * The file name a stored photo uses inside the app's document folder.
 * Old saves kept a full path, so this takes the last part of it.
 */
export const photoFilenameOf = (uriOrFilename: string) =>
  uriOrFilename.includes('/') ? uriOrFilename.split('/').pop() || '' : uriOrFilename;

/**
 * Moves an image from a temporary URI (like one from ImagePicker)
 * to the permanent document directory and returns ONLY the filename.
 */
export const saveImageLocally = async (uri: string): Promise<string> => {
  if (!uri) return '';
  
  // If it's already just a filename, return it
  if (!uri.includes('/')) {
    return uri;
  }

  const originalFilename = uri.split('/').pop() || 'image.jpg';
  const filename = `${Date.now()}-${originalFilename}`; // Add timestamp to avoid collisions
  
  const sourceFile = new File(uri);
  const destFile = new File(Paths.document, filename);

  try {
    await sourceFile.copy(destFile);
    return filename; // Store only the filename!
  } catch (error) {
    console.error('Error saving image locally:', error);
    return uri; // fallback to original if move fails
  }
};
