import { eq } from "drizzle-orm";
import { demoApprovalGraph } from "@sdr-crm/blueprint-core";
import { db, closeDb } from "./index.js";
import * as schema from "./schema.js";
import { DEFAULT_ROLES, INTEGRATOR_PERMISSIONS, MARKETER_PERMISSIONS } from "../lib/permissions.js";
import { buildDefaultDashboard } from "../lib/analytics-defaults.js";
import { ensureSequencerDemoEntities } from "./seed-sequencer-demo.js";
import { ensureRichDemoContent } from "./seed-demo-rich.js";
import { ensureResourcesAssetsDemo } from "./seed-resources-assets.js";
import { hashPassword } from "../lib/auth.js";
import { validatePassword } from "../lib/password.js";
import { generateEmployeeAvatar } from "../lib/generate-avatar.js";
import { backfillProfileAvatars } from "../lib/profile-avatars.js";

const uid = () => crypto.randomUUID();

/** Демо-пользователи создаются только при явном SEED_DEMO_USERS=1. */
const SEED_DEMO = process.env.SEED_DEMO_USERS === "1";

const DEFAULT_PASSWORDS = {
  admin: "Admin1234",
  demo: "Operator1234",
  integrator: "Integrator1234",
  marketer: "Marketer1234",
} as const;

function isDefaultDemoPassword(value: string): boolean {
  return (Object.values(DEFAULT_PASSWORDS) as string[]).includes(value);
}

function resolveAdminPassword(): string {
  if (process.env.NODE_ENV === "production" && !process.env.ADMIN_PASSWORD) {
    throw new Error("ADMIN_PASSWORD must be set in production");
  }
  const value = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORDS.admin;
  if (process.env.NODE_ENV === "production" && isDefaultDemoPassword(value)) {
    throw new Error("ADMIN_PASSWORD must not use default demo password in production");
  }
  return value;
}

function resolveDemoPassword(envVar: keyof typeof DEFAULT_PASSWORDS extends never ? never : string, fallback: string): string {
  const value = process.env[envVar] || fallback;
  if (SEED_DEMO && value === fallback) {
    throw new Error(`Set ${envVar} explicitly when SEED_DEMO_USERS=1`);
  }
  return value;
}

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
  await db.insert(schema.profiles).values({ userId: user.id, name, phone, region: "Москва", avatar: generateEmployeeAvatar(name) });
  console.log(`Demo user: ${login}`);
}

async function runSeed(opts: { closeDb?: boolean } = {}) {
  for (const r of DEFAULT_ROLES) {
    const [existing] = await db.select().from(schema.roles).where(eq(schema.roles.name, r.name)).limit(1);
    if (!existing) {
      await db.insert(schema.roles).values({ name: r.name, label: r.label, permissions: r.permissions });
    }
  }
  if (process.env.SEED_RESET_ROLES === "1") {
    await db.update(schema.roles).set({ permissions: INTEGRATOR_PERMISSIONS })
      .where(eq(schema.roles.name, "integrator"));
    await db.update(schema.roles).set({ permissions: MARKETER_PERMISSIONS })
      .where(eq(schema.roles.name, "marketer"));
    const managerDef = DEFAULT_ROLES.find((r) => r.name === "manager");
    if (managerDef) {
      await db.update(schema.roles).set({ permissions: managerDef.permissions })
        .where(eq(schema.roles.name, "manager"));
    }
    const operatorDef = DEFAULT_ROLES.find((r) => r.name === "operator");
    if (operatorDef) {
      await db.update(schema.roles).set({ permissions: operatorDef.permissions })
        .where(eq(schema.roles.name, "operator"));
    }
  }
  console.log("Roles ensured");

  const adminLogin = process.env.ADMIN_LOGIN || "admin";
  const adminPassword = resolveAdminPassword();
  const demoPassword = resolveDemoPassword("DEMO_PASSWORD", DEFAULT_PASSWORDS.demo);
  const integratorPassword = resolveDemoPassword("INTEGRATOR_PASSWORD", DEFAULT_PASSWORDS.integrator);
  const marketerPassword = resolveDemoPassword("MARKETER_PASSWORD", DEFAULT_PASSWORDS.marketer);
  const adminEmail = process.env.ADMIN_EMAIL || "admin@demo.local";
  const adminName = process.env.ADMIN_NAME || "Игорь Семёнов";

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
      avatar: generateEmployeeAvatar(adminName),
    });
    console.log(`Admin created: ${adminLogin}`);
  } else if (!existingAdmin[0].roleId) {
    await db.update(schema.users).set({ roleId: adminRole.id, updatedAt: new Date() })
      .where(eq(schema.users.id, existingAdmin[0].id));
    console.log(`Admin role restored: ${adminLogin}`);
  }

  if (SEED_DEMO) {
    const [managerRole] = await db.select().from(schema.roles).where(eq(schema.roles.name, "manager")).limit(1);
    const [operatorRole] = await db.select().from(schema.roles).where(eq(schema.roles.name, "operator")).limit(1);
    const [integratorRole] = await db.select().from(schema.roles).where(eq(schema.roles.name, "integrator")).limit(1);
    const [marketerRole] = await db.select().from(schema.roles).where(eq(schema.roles.name, "marketer")).limit(1);

    if (managerRole) await ensureDemoUser("manager", "manager@demo.local", "Алексей Морозов", "+7 (900) 333-33-33", managerRole.id, demoPassword);
    if (operatorRole) await ensureDemoUser("operator", "operator@demo.local", "Ольга Соколова", "+7 (900) 111-11-11", operatorRole.id, demoPassword);
    if (integratorRole) await ensureDemoUser("integrator", "integrator@demo.local", "Сергей Пак", "+7 (900) 222-22-22", integratorRole.id, integratorPassword);
    if (marketerRole) await ensureDemoUser("marketer", "marketer@demo.local", "Марина Лебедева", "+7 (900) 444-44-44", marketerRole.id, marketerPassword);
    const [dealManagerRole] = await db.select().from(schema.roles).where(eq(schema.roles.name, "deal_manager")).limit(1);
    if (dealManagerRole) {
      console.log("Demo dealManagers: elena.volkova / dmitry.orlov / anna.kuznetsova (см. seed-demo-rich, SEED_DEMO_USERS=1)");
    }
  }

  const existingStages = await db.select().from(schema.stages).limit(1);
  if (existingStages.length === 0) {
    let [mainPipeline] = await db.select().from(schema.pipelines).where(eq(schema.pipelines.isDefault, true)).limit(1);
    if (!mainPipeline) {
      [mainPipeline] = await db.insert(schema.pipelines).values({
        name: "Основная",
        sortOrder: 0,
        isDefault: true,
      }).returning();
    }

    const stageData = [
      { label: "Новый лид", color: "sky", sortOrder: 0, automations: [] as const },
      { label: "Связались", color: "cyan", sortOrder: 1, automations: [] },
      { label: "Квалифицирован", color: "teal", sortOrder: 2, automations: [] },
      { label: "Назначен менеджеру", color: "amber", sortOrder: 3, automations: [] },
      { label: "В работе", color: "indigo", sortOrder: 4, automations: [] },
      { label: "Сделка", color: "emerald", sortOrder: 5, automations: [] },
      { label: "Отказ", color: "rose", sortOrder: 6, automations: [] },
    ];
    const insertedStages = await db.insert(schema.stages).values(
      stageData.map((s) => ({ ...s, pipelineId: mainPipeline.id })),
    ).returning();

    const dealStage = insertedStages.find((s: typeof schema.stages.$inferSelect) => s.label === "Сделка");
    if (dealStage) {
      const [docPipeline] = await db.insert(schema.pipelines).values({
        name: "Согласование документов",
        sortOrder: 1,
        isDefault: false,
        pipelineType: "subprocess",
        parentPipelineId: mainPipeline.id,
        parentStageId: dealStage.id,
        description: "Подпроцесс на этапе «Сделка»",
      }).returning();
      const [docStage] = await db.insert(schema.stages).values({
        pipelineId: docPipeline.id,
        label: "Черновик",
        color: "sky",
        sortOrder: 0,
        automations: [],
      }).returning();
      await db.insert(schema.blueprintSpaces).values({
        name: "Согласование договора",
        pipelineId: mainPipeline.id,
        stageId: dealStage.id,
        graph: demoApprovalGraph(),
        enabled: true,
        sortOrder: 0,
      });
      console.log("Blueprint demo: согласование на этапе Сделка, подпроцесс", docPipeline.name, "→", docStage.label);
    }

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
      { name: "Яндекс Cloud AI", type: "ad", connected: false },
    ]);

    const [dealManagerRole] = await db.select().from(schema.roles).where(eq(schema.roles.name, "deal_manager")).limit(1);
    const [rootUnit] = await db.insert(schema.orgUnits).values({
      name: "CRM Demo",
      sortOrder: 0,
      description: "Демо-компания",
      defaultRoleId: dealManagerRole?.id ?? null,
    }).returning();
    await db.insert(schema.orgUnits).values({
      name: "Отдел продаж",
      parentId: rootUnit.id,
      sortOrder: 1,
      defaultRoleId: dealManagerRole?.id ?? null,
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
        assignedDealManagerId: null,
        custom: { f_budget: "12000000", f_object: "Квартира 2к" },
        createdBy: "Демо-форма",
        pdConsent: true,
        pdConsentAt: new Date(),
      },
    ]);

    const integrationSeeds = [
      { type: "tilda", enabled: false, config: { webhookSecret: uid(), fieldMapping: { name: "Name", phone: "Phone", email: "Email", comment: "Comments", preferredTime: "Date" }, consentField: "pd_consent" } },
      { type: "telephony", enabled: false, config: { provider: "beeline", sipGateway: "ip.beeline.ru", apiKey: "", callerId: "", webhookSecret: uid(), callAttachActiveDeal: true, createLeadOnUnknownCall: true } },
      { type: "vk", enabled: false, config: { webhookSecret: uid(), groupId: "", accessToken: "" } },
      { type: "yandex_direct", enabled: false, config: { webhookSecret: uid(), clientLogin: "", token: "", accountId: "" } },
      { type: "yandex_metrica", enabled: false, config: { counterId: "", oauthToken: "", siteUrl: "" } },
      { type: "avito", enabled: false, config: { webhookSecret: uid(), clientId: "", clientSecret: "", userId: "" } },
      { type: "edo", enabled: false, config: { provider: "astral", orgInn: "", clientId: "", clientSecret: "", apiBaseUrl: "https://platform.astral.ru", portalUrl: "https://edo.astral.ru" } },
      { type: "mail", enabled: false, config: { mode: "mock", maxAccountsPerUser: 10 } },
      { type: "mail", enabled: false, config: { mode: "mock", maxAccountsPerUser: 10 } },
      { type: "aiboard", enabled: true, config: {
        enabled: true, providerId: "ollama", baseUrl: "http://127.0.0.1:11434/v1", model: "llama3.2",
        modules: {
          analytics: { enabled: true },
          aggregation: { enabled: true },
          calls: { enabled: true, autoTranscribe: true, autoFillLead: false, whisperModel: "whisper-1" },
          leads: { enabled: true, autoFillLead: false },
          blueprint: { enabled: true },
          site: { enabled: true },
        },
      } },
    ] as const;
    for (const row of integrationSeeds) {
      const [exists] = await db.select().from(schema.integrations).where(eq(schema.integrations.type, row.type)).limit(1);
      if (!exists) await db.insert(schema.integrations).values({ ...row });
    }

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

  await ensureSequencerDemoEntities();
  if (SEED_DEMO) await ensureRichDemoContent();
  await ensureResourcesAssetsDemo();
  await backfillProfileAvatars();

  try {
    const { seedReactorPresets } = await import("../lib/reactor/product-service.js");
    const n = await seedReactorPresets();
    if (n > 0) console.log(`Reactor v3 presets seeded: ${n}`);
  } catch (e) {
    console.warn("Reactor presets seed skipped:", e instanceof Error ? e.message : e);
  }

  if (opts.closeDb !== false) await closeDb();
  console.log("Seed complete");
}

export { runSeed };

const isCli = process.argv[1]?.replace(/\\/g, "/").includes("/db/seed");
if (isCli) {
  runSeed({ closeDb: true }).catch((e) => { console.error(e); process.exit(1); });
}
