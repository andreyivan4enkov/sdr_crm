import { createMiddleware } from "hono/factory";
import { logger } from "../lib/logger.js";
import type { AppEnv } from "./auth.js";

export const requestContext = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = c.req.header("x-request-id") || crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);
  await next();
});

export const requestLog = createMiddleware<AppEnv>(async (c, next) => {
  const start = Date.now();
  const requestId = c.get("requestId");
  const method = c.req.method;
  const path = c.req.path;

  logger.debug("request.start", { requestId, method, path });

  try {
    await next();
    const durationMs = Date.now() - start;
    const status = c.res.status;
    const fields = { requestId, method, path, status, durationMs };

    if (status >= 500) logger.error("request.server_error", fields);
    else if (status >= 400) logger.warn("request.client_error", fields);
    else logger.info("request.complete", fields);
  } catch (err) {
    throw err;
  }
});
