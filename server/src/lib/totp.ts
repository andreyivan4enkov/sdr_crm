import { TOTP, Secret } from "otpauth";
import { createHash, randomBytes } from "node:crypto";

const ISSUER = "JBrealty CRM";

export function generateTotpSecret(login: string) {
  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: ISSUER,
    label: login,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  return {
    secret: secret.base32,
    uri: totp.toString(),
  };
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const totp = new TOTP({ secret: Secret.fromBase32(secret), algorithm: "SHA1", digits: 6, period: 30 });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () => randomBytes(4).toString("hex"));
}

export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function verifyBackupCode(code: string, hashes: string[]): number {
  const h = hashBackupCode(code);
  return hashes.findIndex((x) => x === h);
}
