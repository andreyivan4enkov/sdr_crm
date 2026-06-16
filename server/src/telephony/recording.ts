export async function fetchRecordingBuffer(url: string, authHeader?: string): Promise<Buffer> {
  const headers: Record<string, string> = {};
  if (authHeader) {
    const [k, ...rest] = authHeader.split(":");
    if (k && rest.length) headers[k.trim()] = rest.join(":").trim();
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Не удалось скачать запись (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
