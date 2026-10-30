import * as ImagePicker from 'expo-image-picker';
import type { PhotoContentType } from '@claims/shared';

export type PhotoSource = 'camera' | 'library';
export interface PickedPhoto {
  uri: string;
  contentType: PhotoContentType;
}

function toContentType(mimeType: string | null | undefined): PhotoContentType {
  if (mimeType === 'image/png') return 'image/png';
  if (mimeType === 'image/heic' || mimeType === 'image/heif') return 'image/heic';
  return 'image/jpeg';
}

/** Opens the camera or gallery. Returns null when cancelled or permission is denied. */
export async function pickPhoto(source: PhotoSource): Promise<PickedPhoto | null> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 0.7,
    exif: false,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return { uri: asset.uri, contentType: toContentType(asset.mimeType) };
}
