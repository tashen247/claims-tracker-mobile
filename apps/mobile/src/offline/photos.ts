import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Copies a picked photo out of the picker's cache into the app's documents folder so an
 * offline draft still has its photos after the OS clears caches or the app restarts.
 */
export async function persistDraftPhoto(uri: string): Promise<string> {
  if (Platform.OS === 'web') return uri;
  try {
    const dir = new Directory(Paths.document, 'claim-drafts');
    dir.create({ intermediates: true, idempotent: true });
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${uri.match(/\.\w+$/)?.[0] ?? '.jpg'}`;
    const target = new File(dir, name);
    await new File(uri).copy(target);
    return target.uri;
  } catch {
    return uri;
  }
}

export function deleteDraftPhoto(uri: string): void {
  if (Platform.OS === 'web' || !uri.includes('claim-drafts')) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best effort clean-up.
  }
}
