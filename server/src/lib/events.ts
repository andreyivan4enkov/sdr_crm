type SseClient = { id: string; userId: string; send: (msg: { event: string; data: unknown }) => void };

const clients = new Map<string, SseClient>();

export function addSseClient(client: SseClient) {
  clients.set(client.id, client);
}

export function removeSseClient(id: string) {
  clients.delete(id);
}

export function broadcastEvent(event: string, data: unknown, filter?: (c: SseClient) => boolean) {
  for (const c of clients.values()) {
    if (filter && !filter(c)) continue;
    c.send({ event, data });
  }
}

export function broadcastToAll(event: string, data: unknown) {
  broadcastEvent(event, data);
}

export function broadcastToUsers(userIds: string[], event: string, data: unknown) {
  const set = new Set(userIds);
  broadcastEvent(event, data, (c) => set.has(c.userId));
}
