import { Hono } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { users, roles, profiles, orgUnits } from "../db/schema.js";
import {
  hashPassword, verifyPassword, signToken, getCookieName, cookieOptions,
} from "../lib/auth.js";
import { verifyInviteToken, consumeInviteToken } from "../lib/invites.js";
import { requireAuth, loadUser, type AppEnv } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { validatePassword } from "../lib/password.js";
import { getClientIp } from "../lib/clientIp.js";
import { writeAudit } from "../lib/audit.js";
import {
  generateTotpSecret, verifyTotpCode, generateBackupCodes, hashBackupCode, verifyBackupCode,
} from "../lib/totp.js";
import { validateAvatarDataUrl } from "../lib/avatar.js";
import { generateEmployeeAvatar } from "../lib/generate-avatar.js";
import { toApiUser } from "../lib/user-public.js";
import { createQrLoginToken, consumeQrLoginToken, isAllowedQrBaseUrl } from "../lib/qr-login.js";
import { isDemoLoginAllowed, listDemoUsersForConfig, resolveDemoPassword } from "../lib/demo-login.js";
import { isSecureRequest } from "../lib/secure-cookie.js";
import { withLegacyInviteFlags, withLegacyProfileAccount } from "../lib/api-legacy-fields.js";

const registerSchema = z.object({
  token: z.string().min(10),
  login: z.string().min(3).max(50),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().min(5).max(40),
  position: z.string().min(1).max(120),
  avatar: z.string().max(500_000).optional().nullable(),
  region: z.string().max(100).optional().nullable(),
});

const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

export const authRoutes = new Hono<AppEnv>();

authRoutes.get("/config", (c) => {
  return c.json({ demoLogin: isDemoLoginAllowed() });
});

authRoutes.get("/runtime", requireAuth, (c) => {
  return c.json({
    publicUrl: process.env.PUBLIC_URL || "http://localhost:5173",
    demoLogin: isDemoLoginAllowed(),
    demoUsers: isDemoLoginAllowed() ? listDemoUsersForConfig() : [],
  });
});

authRoutes.post("/demo-login", async (c) => {
  if (!isDemoLoginAllowed()) {
    return c.json({ error: "Demo login disabled" }, 403);
  }
  const ip = getClientIp(c);
  if (!rateLimit(`demo-login:${ip}`, 30, 300_000)) {
    return c.json({ error: "Слишком много попыток. Подождите 5 минут." }, 429);
  }
  const body = z.object({ login: z.string().min(1).max(50) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const password = resolveDemoPassword(body.data.login.trim());
  if (!password) return c.json({ error: "Unknown demo user" }, 404);

  const login = body.data.login.trim();
  const ua = c.req.header("user-agent");
  const [row] = await db.select().from(users).where(eq(users.login, login)).limit(1);
  if (!row) {
    return c.json({ error: "Demo user not seeded" }, 404);
  }
  const valid = await verifyPassword(password, row.passwordHash);
  if (!valid) {
    return c.json({ error: "Demo credentials mismatch — re-run db:seed with SEED_DEMO_USERS=1" }, 401);
  }
  if (row.status !== "active") {
    return c.json({ error: "Demo account not active" }, 403);
  }
  if (row.totpEnabled && row.totpSecret) {
    return c.json({ error: "2FA enabled on demo account" }, 403);
  }

  const authUser = await loadUser(row.id);
  if (!authUser) return c.json({ error: "User not found" }, 401);

  const token = await signToken(authUser);
  const secure = isSecureRequest(c);
  setCookie(c, getCookieName(), token, cookieOptions(secure));
  await writeAudit({ userId: authUser.id, userLogin: authUser.login, action: "auth.login", ip, userAgent: ua, meta: { demo: true } });
  return c.json({ user: toApiUser(authUser) });
});

authRoutes.get("/invite/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ valid: false }, 400);
  const invite = await verifyInviteToken(token).catch(() => null);
  if (!invite) return c.json({ valid: false, error: "Ссылка недействительна или истекла" });
  const [role] = await db.select().from(roles).where(eq(roles.id, invite.roleId)).limit(1);
  if (!role) return c.json({ valid: false, error: "Роль не найдена" });
  let orgUnitName: string | undefined;
  if (invite.orgUnitId) {
    const [unit] = await db.select().from(orgUnits).where(eq(orgUnits.id, invite.orgUnitId)).limit(1);
    orgUnitName = unit?.name;
  }
  return c.json({
    valid: true,
    role: role.label,
    roleName: role.name,
    ...withLegacyInviteFlags({ isDealManager: role.name === "deal_manager" }),
    orgUnitId: invite.orgUnitId,
    orgUnitName,
  });
});

authRoutes.post("/register", async (c) => {
  const ip = getClientIp(c);
  if (!rateLimit(`register:${ip}`, 10, 300_000)) {
    return c.json({ error: "Слишком много попыток. Попробуйте позже." }, 429);
  }
  const body = registerSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input", details: body.error.flatten() }, 400);

  const pwdErr = validatePassword(body.data.password);
  if (pwdErr) return c.json({ error: pwdErr }, 400);

  const invite = await verifyInviteToken(body.data.token).catch(() => null);
  if (!invite) return c.json({ error: "Ссылка-приглашение недействительна или истекла" }, 403);

  const { login, password, name, email, phone, position, avatar, region } = body.data;
  const [existing] = await db.select().from(users).where(eq(users.login, login)).limit(1);
  if (existing) return c.json({ error: "Логин уже занят" }, 409);

  const [existingEmail] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existingEmail) return c.json({ error: "Email уже занят" }, 409);

  const [role] = await db.select().from(roles).where(eq(roles.id, invite.roleId)).limit(1);
  if (!role) return c.json({ error: "Роль не найдена" }, 400);

  if (role.name === "deal_manager" && !region?.trim()) {
    return c.json({ error: "Укажите регион работы" }, 400);
  }

  if (avatar) {
    try {
      validateAvatarDataUrl(avatar);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  }

  const [user] = await db.insert(users).values({
    login,
    email,
    passwordHash: await hashPassword(password),
    status: "pending",
    roleId: role.id,
  }).returning();

  await db.insert(profiles).values({
    userId: user.id,
    name,
    phone,
    region: region?.trim() || null,
    position,
    avatar: avatar || generateEmployeeAvatar(name),
    orgUnitId: invite.orgUnitId || null,
  });

  await consumeInviteToken(body.data.token, invite.jti ?? null);

  await writeAudit({
    userId: user.id, userLogin: login, action: "auth.register",
    ip, userAgent: c.req.header("user-agent"),
    meta: { role: role.name, status: "pending" },
  });

  return c.json({ ok: true, status: "pending", message: "Анкета отправлена. Ожидайте подтверждения администратором." });
});

authRoutes.post("/login", async (c) => {
  const ip = getClientIp(c);
  if (!rateLimit(`login:${ip}`, 15, 300_000)) {
    return c.json({ error: "Слишком много попыток входа. Подождите 5 минут." }, 429);
  }

  const body = loginSchema.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const { login, password } = body.data;
  const ua = c.req.header("user-agent");
  const [row] = await db.select().from(users).where(eq(users.login, login)).limit(1);

  if (!row) {
    await writeAudit({ action: "auth.login_failed", userLogin: login, ip, userAgent: ua, meta: { reason: "unknown_user" } });
    return c.json({ error: "Неверный логин или пароль" }, 401);
  }

  const valid = await verifyPassword(password, row.passwordHash);
  if (!valid) {
    await writeAudit({ userId: row.id, userLogin: login, action: "auth.login_failed", ip, userAgent: ua });
    return c.json({ error: "Неверный логин или пароль" }, 401);
  }

  if (row.status === "pending") {
    return c.json({ error: "Аккаунт ожидает подтверждения администратором", status: "pending" }, 403);
  }
  if (row.status === "rejected") {
    return c.json({ error: "Регистрация отклонена", status: "rejected" }, 403);
  }

  if (row.totpEnabled && row.totpSecret) {
    const code = body.data.totpCode;
    if (!code) return c.json({ requiresTotp: true }, 403);
    let totpOk = verifyTotpCode(row.totpSecret, code);
    if (!totpOk && row.totpBackupCodes?.length) {
      const idx = verifyBackupCode(code, row.totpBackupCodes);
      if (idx >= 0) {
        totpOk = true;
        const next = [...row.totpBackupCodes];
        next.splice(idx, 1);
        await db.update(users).set({ totpBackupCodes: next, updatedAt: new Date() }).where(eq(users.id, row.id));
      }
    }
    if (!totpOk) {
      await writeAudit({ userId: row.id, userLogin: login, action: "auth.login_failed", ip, userAgent: ua, meta: { reason: "bad_totp" } });
      return c.json({ error: "Неверный код 2FA" }, 401);
    }
  }

  const authUser = await loadUser(row.id);
  if (!authUser) return c.json({ error: "User not found" }, 401);

  const token = await signToken(authUser);
  const secure = isSecureRequest(c);
  setCookie(c, getCookieName(), token, cookieOptions(secure));

  await writeAudit({ userId: authUser.id, userLogin: authUser.login, action: "auth.login", ip, userAgent: ua });

  return c.json({ user: toApiUser(authUser) });
});

const qrCreateSchema = z.object({
  baseUrl: z.string().url().optional(),
});

function corsOrigins() {
  return (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

authRoutes.post("/qr/create", requireAuth, async (c) => {
  const user = c.get("user");
  const body = qrCreateSchema.safeParse(await c.req.json().catch(() => ({})));
  const allowed = corsOrigins();
  const fallback = process.env.PUBLIC_URL || allowed[0] || "http://localhost:5173";
  const baseUrl = body.success && body.data.baseUrl ? body.data.baseUrl : fallback;
  if (!isAllowedQrBaseUrl(baseUrl, allowed)) {
    return c.json({ error: "Недопустимый адрес для QR-кода" }, 400);
  }
  const { token, expiresAt } = createQrLoginToken(user.id, user.login);
  const url = `${baseUrl.replace(/\/$/, "")}/auth/qr?t=${encodeURIComponent(token)}`;
  await writeAudit({
    userId: user.id,
    userLogin: user.login,
    action: "auth.qr_create",
    ip: getClientIp(c),
    userAgent: c.req.header("user-agent"),
  });
  return c.json({ token, expiresAt, url });
});

authRoutes.post("/qr/accept", async (c) => {
  const ip = getClientIp(c);
  if (!rateLimit(`qr_accept:${ip}`, 20, 60_000)) {
    return c.json({ error: "Слишком много попыток. Подождите минуту." }, 429);
  }
  const body = z.object({ token: z.string().min(10) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const consumed = consumeQrLoginToken(body.data.token);
  if (!consumed) {
    return c.json({ error: "QR-код истёк или уже использован" }, 401);
  }

  const authUser = await loadUser(consumed.userId);
  if (!authUser) return c.json({ error: "Пользователь не найден" }, 401);
  if (authUser.status === "pending") {
    return c.json({ error: "Аккаунт ожидает подтверждения администратором", status: "pending" }, 403);
  }
  if (authUser.status === "rejected") {
    return c.json({ error: "Регистрация отклонена", status: "rejected" }, 403);
  }

  const token = await signToken(authUser);
  const secure = isSecureRequest(c);
  setCookie(c, getCookieName(), token, cookieOptions(secure));

  const ua = c.req.header("user-agent");
  await writeAudit({
    userId: authUser.id,
    userLogin: authUser.login,
    action: "auth.qr_login",
    ip,
    userAgent: ua,
  });

  return c.json({ user: toApiUser(authUser) });
});

authRoutes.post("/logout", async (c) => {
  const token = getCookie(c, getCookieName());
  if (token) {
    try {
      const { verifyToken } = await import("../lib/auth.js");
      const payload = await verifyToken(token);
      await writeAudit({
        userId: payload.sub,
        userLogin: payload.login,
        action: "auth.logout",
        ip: getClientIp(c),
        userAgent: c.req.header("user-agent"),
      });
    } catch { /* ignore */ }
  }
  deleteCookie(c, getCookieName(), { path: "/" });
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ user: toApiUser(user) });
});

authRoutes.get("/profile", requireAuth, async (c) => {
  const user = c.get("user");
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  return c.json({
    profile,
    account: withLegacyProfileAccount({
      login: user.login,
      email: user.email,
      role: user.roleName,
      roleLabel: user.roleLabel || user.roleName,
      status: user.status,
      orgUnitName: user.orgUnitName,
      isDealManager: user.roleName === "deal_manager",
    }),
  });
});

authRoutes.patch("/profile", requireAuth, async (c) => {
  const user = c.get("user");
  const body = z.object({
    name: z.string().min(1).max(200).optional(),
    phone: z.string().min(5).max(40).optional().nullable(),
    position: z.string().min(1).max(120).optional().nullable(),
    region: z.string().max(100).optional().nullable(),
    email: z.string().email().optional(),
    avatar: z.string().max(500_000).optional().nullable(),
    locale: z.enum(["ru", "en", "zh", "fr", "de"]).optional(),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const isDealManager = user.roleName === "deal_manager";
  if (body.data.region !== undefined && isDealManager && !body.data.region?.trim()) {
    return c.json({ error: "Укажите регион работы" }, 400);
  }

  let avatar = body.data.avatar;
  if (avatar !== undefined && avatar !== null) {
    try {
      avatar = validateAvatarDataUrl(avatar);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 400);
    }
  }

  if (body.data.email && body.data.email !== user.email) {
    const [taken] = await db.select().from(users).where(eq(users.email, body.data.email)).limit(1);
    if (taken && taken.id !== user.id) return c.json({ error: "Email уже занят" }, 409);
    await db.update(users).set({ email: body.data.email, updatedAt: new Date() }).where(eq(users.id, user.id));
  }

  const [existing] = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
  const profilePatch = {
    ...(body.data.name !== undefined ? { name: body.data.name.trim() } : {}),
    ...(body.data.phone !== undefined ? { phone: body.data.phone } : {}),
    ...(body.data.position !== undefined ? { position: body.data.position } : {}),
    ...(body.data.region !== undefined ? { region: body.data.region } : {}),
    ...(body.data.locale !== undefined ? { locale: body.data.locale } : {}),
    ...(avatar !== undefined ? { avatar } : {}),
    updatedAt: new Date(),
  };

  let profile;
  if (existing) {
    [profile] = await db.update(profiles).set(profilePatch).where(eq(profiles.userId, user.id)).returning();
  } else {
    [profile] = await db.insert(profiles).values({
      userId: user.id,
      name: body.data.name?.trim() || user.login,
      phone: body.data.phone ?? null,
      position: body.data.position ?? null,
      region: body.data.region ?? null,
      avatar: avatar ?? generateEmployeeAvatar(body.data.name?.trim() || user.login),
    }).returning();
  }

  await writeAudit({
    userId: user.id,
    userLogin: user.login,
    action: "user.update",
    entityType: "profile",
    entityId: user.id,
    ip: getClientIp(c),
    userAgent: c.req.header("user-agent"),
    meta: { self: true },
  });

  const fresh = await loadUser(user.id);
  return c.json({ profile, user: fresh ? toApiUser(fresh) : null });
});

authRoutes.patch("/password", requireAuth, async (c) => {
  const user = c.get("user");
  const ip = getClientIp(c);
  if (!rateLimit(`pwd:${user.id}:${ip}`, 5, 300_000)) {
    return c.json({ error: "Слишком много попыток. Подождите 5 минут." }, 429);
  }

  const body = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  if (body.data.currentPassword === body.data.newPassword) {
    return c.json({ error: "Новый пароль должен отличаться от текущего" }, 400);
  }

  const pwdErr = validatePassword(body.data.newPassword);
  if (pwdErr) return c.json({ error: pwdErr }, 400);

  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row) return c.json({ error: "User not found" }, 404);

  const valid = await verifyPassword(body.data.currentPassword, row.passwordHash);
  if (!valid) return c.json({ error: "Неверный текущий пароль" }, 401);

  await db.update(users).set({
    passwordHash: await hashPassword(body.data.newPassword),
    updatedAt: new Date(),
  }).where(eq(users.id, user.id));

  await writeAudit({
    userId: user.id,
    userLogin: user.login,
    action: "auth.password_change",
    entityType: "user",
    entityId: user.id,
    ip,
    userAgent: c.req.header("user-agent"),
  });

  return c.json({ ok: true });
});

authRoutes.post("/totp/setup", requireAuth, async (c) => {
  const ip = getClientIp(c);
  if (!rateLimit(`totp-setup:${ip}`, 5, 300_000)) {
    return c.json({ error: "Слишком много попыток. Подождите 5 минут." }, 429);
  }
  const user = c.get("user");
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (row?.totpEnabled) {
    return c.json({ error: "Сначала отключите 2FA" }, 409);
  }
  const { secret, uri } = generateTotpSecret(user.login);
  await db.update(users).set({
    totpSecret: secret,
    totpEnabled: false,
    updatedAt: new Date(),
  }).where(eq(users.id, user.id));
  return c.json({ uri });
});

authRoutes.post("/totp/enable", requireAuth, async (c) => {
  const user = c.get("user");
  const body = z.object({ code: z.string().length(6) }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row?.totpSecret) return c.json({ error: "Сначала запустите настройку 2FA" }, 400);
  if (row.totpEnabled) return c.json({ error: "2FA уже включена" }, 400);

  if (!verifyTotpCode(row.totpSecret, body.data.code)) {
    return c.json({ error: "Неверный код" }, 400);
  }
  const backupCodes = generateBackupCodes();
  const hashed = backupCodes.map(hashBackupCode);
  await db.update(users).set({
    totpEnabled: true,
    totpBackupCodes: hashed,
    updatedAt: new Date(),
  }).where(eq(users.id, user.id));
  return c.json({ ok: true, backupCodes });
});

authRoutes.post("/totp/disable", requireAuth, async (c) => {
  const user = c.get("user");
  const body = z.object({
    password: z.string().min(1),
    code: z.string().min(6),
  }).safeParse(await c.req.json());
  if (!body.success) return c.json({ error: "Invalid input" }, 400);

  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row) return c.json({ error: "Not found" }, 404);
  if (!(await verifyPassword(body.data.password, row.passwordHash))) {
    return c.json({ error: "Неверный пароль" }, 401);
  }
  if (!row.totpSecret) {
    return c.json({ error: "2FA не настроена" }, 400);
  }
  if (!verifyTotpCode(row.totpSecret, body.data.code)) {
    return c.json({ error: "Неверный код 2FA" }, 401);
  }
  await db.update(users).set({
    totpSecret: null,
    totpEnabled: false,
    totpBackupCodes: [],
    updatedAt: new Date(),
  }).where(eq(users.id, user.id));
  return c.json({ ok: true });
});

authRoutes.get("/totp/status", requireAuth, async (c) => {
  const user = c.get("user");
  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  return c.json({
    enabled: row?.totpEnabled ?? false,
    available: true,
  });
});
