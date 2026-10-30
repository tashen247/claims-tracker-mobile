/** Web: read the picked file as a Blob and PUT it. Returns the HTTP status. */
export async function uploadFile(
  url: string,
  localUri: string,
  headers: Record<string, string>,
): Promise<number> {
  const blob = await (await fetch(localUri)).blob();
  const response = await fetch(url, { method: 'PUT', headers, body: blob });
  return response.status;
}
