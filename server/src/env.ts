import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(serverRoot, ".env") });

const prod = process.env.NODE_ENV === "production";
const jwt = process.env.JWT_SECRET || "";

if (prod) {
  if (jwt.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters in production");
  }
} else if (jwt.length < 16) {
  process.env.JWT_SECRET = "dev-only-jwt-secret-not-for-production";
}
