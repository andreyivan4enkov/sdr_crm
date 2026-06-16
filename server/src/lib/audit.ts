import { db } from "../db/index.js";
import { auditLog } from "../db/schema.js";
import { logger } from "./logger.js";

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "lead.list"
  | "lead.read"
  | "lead.create"
  | "lead.update"
  | "lead.delete"
  | "lead.erase"
  | "lead.export"
  | "lead.consent_revoke"
  | "lead.public_create"
  | "lead.retention_purge"
  | "lead.note"
  | "user.invite"
  | "user.approve"
  | "user.reject"
  | "user.dismiss"
  | "user.update"
  | "auth.register"
  | "auth.password_change"
  | "role.create"
  | "role.update"
  | "role.delete"
  | "org_unit.create"
  | "org_unit.update"
  | "org_unit.delete"
  | "employee.create"
  | "employee.update"
  | "employee.delete"
  | "integration.update"
  | "webhook.tilda"
  | "webhook.marketing"
  | "settings.change";

export async function writeAudit(opts: {
  userId?: string | null;
  userLogin?: string | null;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  ip?: string;
  userAgent?: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLog).values({
      userId: opts.userId || null,
      userLogin: opts.userLogin || null,
      action: opts.action,
      entityType: opts.entityType || null,
      entityId: opts.entityId || null,
      ip: opts.ip || null,
      userAgent: opts.userAgent?.slice(0, 512) || null,
      meta: opts.meta || {},
    });
  } catch (e) {
    logger.logError(e, "audit.write_failed");
  }
}
