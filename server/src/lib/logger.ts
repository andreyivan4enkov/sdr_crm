import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEYS = /password|passwd|token|secret|authorization|cookie|jwt/i;

function minLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || "").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEYS.test(key)) return "[REDACTED]";
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = redactValue(k, v);
  }
  return out;
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
    };
  }
  return { message: String(err) };
}

function write(level: LogLevel, message: string, fields?: Record<string, unknown>) {
  if (LEVEL_RANK[level] < LEVEL_RANK[minLevel()]) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    service: "sdr-crm-api",
    msg: message,
    ...(fields ? redactObject(fields) : {}),
  };

  const line = JSON.stringify(entry);
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }

  const logFile = process.env.LOG_FILE;
  if (logFile) {
    try {
      mkdirSync(dirname(logFile), { recursive: true });
      appendFileSync(logFile, `${line}\n`, "utf8");
    } catch (e) {
      console.error(JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        service: "sdr-crm-api",
        msg: "Failed to write LOG_FILE",
        err: serializeError(e),
      }));
    }
  }
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write("debug", message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write("info", message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write("warn", message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write("error", message, fields),
  logError: (err: unknown, message: string, fields?: Record<string, unknown>) => {
    write("error", message, { ...fields, err: serializeError(err) });
  },
};

export function installProcessErrorHandlers() {
  process.on("uncaughtException", (err) => {
    logger.logError(err, "uncaughtException");
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    logger.logError(reason, "unhandledRejection");
  });
}
