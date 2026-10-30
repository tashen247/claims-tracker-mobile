import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';

/**
 * Native (iOS/Android): streams the file from disk straight to the URL. More reliable for
 * large photos than reading the file into a JS Blob and sending it with fetch.
 * Returns the HTTP status.
 */
export async function uploadFile(
  url: string,
  localUri: string,
  headers: Record<string, string>,
): Promise<number> {
  const result = await uploadAsync(url, localUri, {
    httpMethod: 'PUT',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers,
  });
  return result.status;
}
