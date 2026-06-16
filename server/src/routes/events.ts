import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { requireAuth, type AppEnv } from "../middleware/auth.js";
import { addSseClient, removeSseClient } from "../lib/events.js";

export const eventRoutes = new Hono<AppEnv>();

eventRoutes.get("/stream", requireAuth, (c) => {
  const user = c.get("user");
  const clientId = crypto.randomUUID();

  return streamSSE(c, async (stream) => {
    addSseClient({
      id: clientId,
      userId: user.id,
      send: ({ event, data }) => {
        void stream.writeSSE({ event, data: JSON.stringify(data) });
      },
    });

    await stream.writeSSE({ event: "connected", data: JSON.stringify({ userId: user.id }) });

    const keepAlive = setInterval(() => {
      void stream.writeSSE({ event: "ping", data: "{}" });
    }, 30000);

    stream.onAbort(() => {
      clearInterval(keepAlive);
      removeSseClient(clientId);
    });

    await new Promise(() => {});
  });
});
