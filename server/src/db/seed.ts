import { eq } from "drizzle-orm";
import { db, closeDb } from "./index.js";
import * as schema from "./schema.js";
import { DEFAULT_ROLES, INTEGRATOR_PERMISSIONS, MARKETER_PERMISSIONS } from "../lib/permissions.js";
import { buildDefaultDashboard } from "../lib/analytics-defaults.js";
import { hashPassword } from "../lib/auth.js";
import { validatePassword } from "../lib/password.js";

const uid = () => crypto.randomUUID();

/** Публичный репозиторий: всегда создаём демо-пользователей (без реальных аккаунтов). */
const SEED_DEMO = process.env.SEED_DEMO_USERS !== "0";

async function ensureDemoUser(
  login: string,
  email: string,
  name: string,
  phone: string,
  roleId: string,
  password: string,
) {
  const existing = await db.select().from(schema.users).where(eq(schema.users.login, login)).limit(1);
  if (existing.length) return;
  const [user] = await db.insert(schema.users).values({
    login,
    email,
    passwordHash: await hashPassword(password),
    status: "active",
    roleId,
  }).returning();
  await db.insert(schema.profiles).values({ userId: user.id, name, phone, region: "Москва" });
  console.log(`Demo user: ${login}`);
}

async function seed() {
  for (const r of DEFAULT_ROLES) {
    const [existing] = await db.select().from(schema.roles).where(eq(schema.roles.name, r.name)).limit(1);
    if (!existing) {
      await db.insert(schema.roles).values({ name: r.name, label: r.label, permissions: r.permissions });
    }
  }
  await db.update(schema.roles).set({ permissions: INTEGRATOR_PERMISSIONS })
    .where(eq(schema.roles.name, "integrator"));
  await db.update(schema.roles).set({ permissions: MARKETER_PERMISSIONS })
    .where(eq(schema.roles.name, "marketer"));
  const managerDef = DEFAULT_ROLES.find((r) => r.name === "manager");
  if (managerDef) {
    await db.update(schema.roles).set({ permissions: managerDef.permissions })
      .where(eq(schema.roles.name, "manager"));
  }
  console.log("Roles ensured");

  const adminLogin = process.env.ADMIN_LOGIN || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin1234";
  const demoPassword = process.env.DEMO_PASSWORD || "Operator1234";
  const integratorPassword = process.env.INTEGRATOR_PASSWORD || "Integrator1234";
  const marketerPassword = process.env.MARKETER_PASSWORD || "Marketer1234";
  const adminEmail = process.env.ADMIN_EMAIL || "admin@demo.local";
  const adminName = process.env.ADMIN_NAME || "Администратор (демо)";

  const adminPwdCheck = validatePassword(adminPassword);
  if (adminPwdCheck && process.env.NODE_ENV === "production" && !SEED_DEMO) {
    throw new Error(`ADMIN_PASSWORD: ${adminPwdCheck}`);
  }

  const [adminRole] = await db.select().from(schema.roles).where(eq(schema.roles.name, "admin")).limit(1);
  if (!adminRole) throw new Error("Admin role missing");

  const existingAdmin = await db.select().from(schema.users).where(eq(schema.users.login, adminLogin)).limit(1);
  if (existingAdmin.length === 0) {
    const [user] = await db.insert(schema.users).values({
      login: adminLogin,
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      status: "active",
      roleId: adminRole.id,
    }).returning();
    await db.insert(schema.profiles).values({
      userId: user.id,
      name: adminName,
      phone: "+7 (900) 000-00-00",
      region: "Москва",
    });
    console.log(`Admin created: ${adminLogin}`);
  }

  if (SEED_DEMO) {
    const [managerRole] = await db.select().from(schema.roles).where(eq(schema.roles.name, "manager")).limit(1);
    const [operatorRole] = await db.select().from(schema.roles).where(eq(schema.roles.name, "operator")).limit(1);
    const [integratorRole] = await db.select().from(schema.roles).where(eq(schema.roles.name, "integrator")).limit(1);
    const [marketerRole] = await db.select().from(schema.roles).where(eq(schema.roles.name, "marketer")).limit(1);

    if (managerRole) await ensureDemoUser("manager", "manager@demo.local", "Руководитель", "+7 (900) 333-33-33", managerRole.id, demoPassword);
    if (operatorRole) await ensureDemoUser("operator", "operator@demo.local", "Оператор", "+7 (900) 111-11-11", operatorRole.id, demoPassword);
    if (integratorRole) await ensureDemoUser("integrator", "integrator@demo.local", "Интегратор", "+7 (900) 222-22-22", integratorRole.id, integratorPassword);
    if (marketerRole) await ensureDemoUser("marketer", "marketer@demo.local", "Маркетолог", "+7 (900) 444-44-44", marketerRole.id, marketerPassword);
  }

  const existingStages = await db.select().from(schema.stages).limit(1);
  if (existingStages.length === 0) {
    const [mainPipeline] = await db.insert(schema.pipelines).values({
      name: "Основная",
      sortOrder: 0,
      isDefault: true,
    }).returning();

    const stageData = [
      { label: "Новый лид", color: "sky", sortOrder: 0, automations: [
        { id: uid(), type: "reply" as const, channelId: null, author: "Система", recipient: "Клиент",
          text: "Спасибо за заявку! Перезвоним в удобное время." },
      ] },
      { label: "Связались", color: "cyan", sortOrder: 1, automations: [] },
      { label: "Квалифицирован", color: "teal", sortOrder: 2, automations: [] },
      { label: "Передан риэлтору", color: "amber", sortOrder: 3, automations: [
        { id: uid(), type: "notify" as const, author: "Система", recipient: "Ответственный", text: "Вам передан новый клиент" },
      ] },
      { label: "В работе", color: "indigo", sortOrder: 4, automations: [] },
      { label: "Сделка", color: "emerald", sortOrder: 5, automations: [] },
      { label: "Отказ", color: "rose", sortOrder: 6, automations: [] },
    ];
    const insertedStages = await db.insert(schema.stages).values(
      stageData.map((s) => ({ ...s, pipelineId: mainPipeline.id })),
    ).returning();

    await db.insert(schema.fields).values([
      { label: "Бюджет", type: "money", sortOrder: 0 },
      { label: "Тип объекта", type: "text", sortOrder: 1 },
    ]);

    const chSite = await db.insert(schema.channels).values({
      name: "Форма на сайте", type: "site", connected: true,
    }).returning();
    await db.insert(schema.channels).values([
      { name: "Tilda", type: "site", connected: false },
      { name: "Телефония", type: "site", connected: false },
      { name: "Telegram", type: "messenger", connected: false },
      { name: "WhatsApp", type: "messenger", connected: false },
      { name: "VK", type: "messenger", connected: false },
      { name: "Instagram Direct", type: "messenger", connected: false },
      { name: "Avito", type: "ad", connected: false },
      { name: "Яндекс Директ", type: "ad", connected: false },
      { name: "Яндекс Метрика", type: "ad", connected: false },
    ]);

    const [realtorRole] = await db.select().from(schema.roles).where(eq(schema.roles.name, "realtor")).limit(1);
    const [rootUnit] = await db.insert(schema.orgUnits).values({
      name: "JBrealty Demo",
      sortOrder: 0,
      description: "Демо-компания",
      defaultRoleId: realtorRole?.id ?? null,
    }).returning();
    await db.insert(schema.orgUnits).values({
      name: "Отдел продаж",
      parentId: rootUnit.id,
      sortOrder: 1,
      defaultRoleId: realtorRole?.id ?? null,
    });
    await db.insert(schema.orgUnits).values({
      name: "Операторский центр",
      parentId: rootUnit.id,
      sortOrder: 2,
    });

    const siteChannel = chSite[0];
    await db.insert(schema.leads).values([
      {
        name: "Иван Демо", phone: "+7 (905) 111-22-33", region: "Москва",
        preferredTime: "Сегодня после 18:00", comment: "Двушка, бюджет до 12 млн (демо-лид).",
        source: "form", channelId: siteChannel.id, pipelineId: mainPipeline.id, statusId: insertedStages[2].id,
        assignedRealtorId: null,
        custom: { f_budget: "12000000", f_object: "Квартира 2к" },
        createdBy: "Демо-форма",
        pdConsent: true,
        pdConsentAt: new Date(),
      },
    ]);

    await db.insert(schema.integrations).values([
      { type: "tilda", enabled: false, config: { webhookSecret: uid(), fieldMapping: { name: "Name", phone: "Phone", email: "Email", comment: "Comments", preferredTime: "Date" }, consentField: "pd_consent" } },
      { type: "telephony", enabled: false, config: { provider: "beeline", sipGateway: "ip.beeline.ru", apiKey: "", callerId: "", webhookSecret: uid(), callAttachActiveDeal: true, createLeadOnUnknownCall: true } },
      { type: "vk", enabled: false, config: { webhookSecret: uid(), groupId: "", accessToken: "" } },
      { type: "yandex_direct", enabled: false, config: { webhookSecret: uid(), clientLogin: "", token: "", accountId: "" } },
      { type: "yandex_metrica", enabled: false, config: { counterId: "", oauthToken: "", siteUrl: "" } },
      { type: "avito", enabled: false, config: { webhookSecret: uid(), clientId: "", clientSecret: "", userId: "" } },
    ]);

    console.log("CRM demo data seeded");
  }

  const existingDash = await db.select().from(schema.analyticsDashboards).limit(1);
  if (existingDash.length === 0) {
    const stageRows = await db.select().from(schema.stages).orderBy(schema.stages.sortOrder);
    if (stageRows.length) {
      await db.insert(schema.analyticsDashboards).values(buildDefaultDashboard(stageRows));
      console.log("Default analytics dashboard created");
    }
  }

  await closeDb();
  console.log("Seed complete");
}

seed().catch((e) => { console.error(e); process.exit(1); });
