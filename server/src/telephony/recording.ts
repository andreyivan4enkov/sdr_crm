import { urlSafeFetchBuffer } from "../lib/url-safe-fetch.js";

export async function fetchRecordingBuffer(url: string, authHeader?: string): Promise<Buffer> {
  const headers: Record<string, string> = {};
  if (authHeader) {
    const [k, ...rest] = authHeader.split(":");
    if (k && rest.length) headers[k.trim()] = rest.join(":").trim();
  }
  return urlSafeFetchBuffer(url, headers);
}
